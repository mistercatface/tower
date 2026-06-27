import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applySnakeGameConfig, getSnakeGameConfig } from "../Libraries/Game/snake/snakeGameConfig.js";
import { createSnakeGameHarnessState, wireSnakeTestGame, registerSnakeTestInstance, primeSnakeHeadVision } from "./harness/snakeGameHarness.js";
import { spawnSnakeChain } from "../Libraries/Game/snake/snakeScene.js";
import { AgentInstance } from "../Libraries/Game/snake/AgentInstance.js";
import { AGENT_PROFILE } from "../Libraries/AI/agents/agentProfile.js";
import { spawnGameAgentChain } from "../Libraries/Game/snake/spawnAgentChain.js";
import { registerAgentInstance } from "../Libraries/Game/snake/snakeAgentSession.js";
import { getObserverVisionFrame } from "../Libraries/Navigation/perception/observerVisionFrame.js";
import { resolveGunBulletContacts, tickGunBullets, spawnGunBulletProjectile } from "../Libraries/Game/snake/gunAgent/gunBulletSystem.js";
import { createKineticTestTick, mockKineticCircle } from "./harness/kineticTickHarness.js";
import { gatherKineticContactPairs, kineticContactBuffer, resolveKineticContactPassWithPairs } from "../Libraries/Spatial/collision/kineticContactSolver.js";
import { getPropCategoryIndex } from "../GameState/SandboxWorldState.js";
import { syncBallAgentFacingAfterPhysics } from "../Libraries/Game/snake/ballAgent.js";
import { kineticDynamicSlab } from "../Libraries/Spatial/collision/kineticBodySlab.js";
describe("flee agent bullets and combat", () => {
    it("can spawn flee agents, shoot bullets, perform LOS check, resolve combat kills, and transition spent bullets to food", async () => {
        applySnakeGameConfig();
        const { state } = await createSnakeGameHarnessState();
        const { snakeGame } = wireSnakeTestGame(state);
        const fleePack = spawnGameAgentChain(state, { col: 5, row: 5 }, "flee_agent");
        const fleeInstance = new AgentInstance(state, { profileId: AGENT_PROFILE.flee, head: fleePack.head, spawnGroupId: fleePack.spawnGroupId });
        registerAgentInstance(snakeGame, "flee_agent", fleeInstance);
        fleeInstance.start();
        const snakePack = spawnSnakeChain(state, { col: 10, row: 5 }, { segmentCount: 3, spacing: 12, segmentRadius: 2, linkSlack: 0.1, faction: "alpha", exportType: "snake" });
        const snakeInstance = registerSnakeTestInstance(state, snakeGame, { headId: snakePack.chain.head.id, spawnGroupId: snakePack.chain.spawnGroupId });
        state.nav.observerVisionFrame = {
            ensureHeadVision: (seeker, range) => {
                return {
                    cells: [
                        { col: 5, row: 5 },
                        { col: 10, row: 5 },
                    ],
                    cellSet: new Set([5 + 5 * state.obstacleGrid.cols, 10 + 5 * state.obstacleGrid.cols]),
                };
            },
            isVisible: () => true,
        };
        const canSee = getObserverVisionFrame(state).isVisible(fleePack.head, snakePack.chain.head.x, snakePack.chain.head.y);
        assert.ok(canSee, "Flee agent should see snake");
        primeSnakeHeadVision(state, fleePack.head, getSnakeGameConfig().shared.visionRange);
        assert.equal(snakeGame.activeGunBulletIds.length, 0);
        fleeInstance.autosim.tick(16);
        assert.equal(fleeInstance.intent.getMode(), "shoot_enemy");
        assert.equal(fleeInstance.combatAction.phase, "reacting");
        assert.equal(snakeGame.activeGunBulletIds.length, 0, "Should not spawn bullet immediately");
        assert.notEqual(fleePack.head._groundRollDrive?.kind, "brake", "Should not hard-brake while engaging");
        fleeInstance.autosim.tick(150);
        assert.equal(snakeGame.activeGunBulletIds.length, 1, "Should spawn one bullet after reacting");
        assert.equal(fleeInstance.combatAction.phase, "fire_delay");
        fleeInstance.autosim.tick(150);
        assert.equal(snakeGame.activeGunBulletIds.length, 2, "Should spawn second bullet after fire delay");
        assert.equal(fleeInstance.combatAction.phase, "fire_delay");
        fleeInstance.autosim.tick(150);
        assert.equal(snakeGame.activeGunBulletIds.length, 3, "Should spawn third bullet after fire delay");
        assert.equal(fleeInstance.combatAction.phase, "reloading");
        fleeInstance.autosim.tick(500);
        assert.equal(fleeInstance.combatAction.phase, "idle", "Should return to idle after reloading");
        const bulletId = snakeGame.activeGunBulletIds[0];
        const bullet = state.entityRegistry.getLive(bulletId);
        assert.ok(bullet, "Bullet prop must exist");
        assert.equal(bullet._gunBullet, true);
        assert.equal(bullet._armed, true);
        assert.equal(bullet._shooterHeadId, fleeInstance.headId);
        const head = snakePack.chain.head;
        const mockHead = mockKineticCircle(head.x, head.y, head.radius ?? 2, -100, 0, { id: head.id });
        const mockBullet = mockKineticCircle(head.x - (head.radius ?? 2) - (bullet.radius ?? 1) + 2, head.y, bullet.radius ?? 1, 100, 0, { id: bullet.id });
        mockBullet._gunBullet = true;
        mockBullet._armed = true;
        mockBullet._shooterHeadId = fleeInstance.headId;
        const tick = createKineticTestTick([mockBullet, mockHead], { cellSize: 50 });
        const pairs = gatherKineticContactPairs(tick);
        assert.ok(pairs.count > 0, "Bullet and snake head should overlap for contact pairs");
        resolveKineticContactPassWithPairs(tick, pairs);
        assert.ok(kineticContactBuffer.count > 0, "Contact solver should emit at least one contact");
        resolveGunBulletContacts(state, tick.frame, kineticContactBuffer);
        assert.equal(snakeInstance.lifecycle, "dead", "Snake should be killed by bullet");
        assert.equal(mockBullet._armed, false, "Bullet should be disarmed on contact");
        bullet._armed = false;
        assert.equal(snakeGame.activeGunBulletIds.length, 3);
        tickGunBullets(state, 16);
        assert.equal(snakeGame.activeGunBulletIds.length, 2, "Disarmed bullet should be removed from active queue");
        assert.equal(state.entityRegistry.getLive(bullet.id), null, "Spent bullet should be released from registry");
    });
    it("smoothly rotates toward target while reacting", async () => {
        applySnakeGameConfig();
        const { state } = await createSnakeGameHarnessState();
        const { snakeGame } = wireSnakeTestGame(state);
        const fleePack = spawnGameAgentChain(state, { col: 5, row: 5 }, "flee_agent");
        const fleeInstance = new AgentInstance(state, { profileId: AGENT_PROFILE.flee, head: fleePack.head, spawnGroupId: fleePack.spawnGroupId });
        registerAgentInstance(snakeGame, "flee_agent", fleeInstance);
        fleeInstance.start();
        const snakePack = spawnSnakeChain(state, { col: 10, row: 8 }, { segmentCount: 3, spacing: 12, segmentRadius: 2, linkSlack: 0.1, faction: "alpha", exportType: "snake" });
        registerSnakeTestInstance(state, snakeGame, { headId: snakePack.chain.head.id, spawnGroupId: snakePack.chain.spawnGroupId });
        state.nav.observerVisionFrame = {
            ensureHeadVision: () => ({
                cells: [
                    { col: 5, row: 5 },
                    { col: 10, row: 8 },
                ],
                cellSet: new Set([5 + 5 * state.obstacleGrid.cols, 10 + 8 * state.obstacleGrid.cols]),
            }),
            isVisible: () => true,
        };
        const fleeAgent = fleePack.head;
        fleeAgent.facing = 0;
        primeSnakeHeadVision(state, fleePack.head, getSnakeGameConfig().shared.visionRange);
        fleeInstance.autosim.tick(100);
        assert.equal(fleeInstance.intent.getMode(), "shoot_enemy");
        assert.ok(fleeAgent.facing > 0, "Should start rotating toward the target");
        assert.ok(fleeAgent.facing < Math.atan2(snakePack.chain.head.y - fleeAgent.y, snakePack.chain.head.x - fleeAgent.x) + 1e-4, "Should rotate smoothly without snapping instantly");
    });
    it("waits for aim alignment after reaction timer before firing", async () => {
        applySnakeGameConfig({ agentProfiles: { flee_agent: { weapon: { reactionMs: 1, fireAimToleranceRad: 0.02, aimRotationRadPerSec: 0.5 } } } });
        const { state } = await createSnakeGameHarnessState();
        const { snakeGame } = wireSnakeTestGame(state);
        const fleePack = spawnGameAgentChain(state, { col: 5, row: 5 }, "flee_agent");
        const fleeInstance = new AgentInstance(state, { profileId: AGENT_PROFILE.flee, head: fleePack.head, spawnGroupId: fleePack.spawnGroupId });
        registerAgentInstance(snakeGame, "flee_agent", fleeInstance);
        fleeInstance.start();
        const snakePack = spawnSnakeChain(state, { col: 10, row: 5 }, { segmentCount: 3, spacing: 12, segmentRadius: 2, linkSlack: 0.1, faction: "alpha", exportType: "snake" });
        registerSnakeTestInstance(state, snakeGame, { headId: snakePack.chain.head.id, spawnGroupId: snakePack.chain.spawnGroupId });
        state.nav.observerVisionFrame = {
            ensureHeadVision: () => ({ cells: [{ col: 5, row: 5 }, { col: 10, row: 5 }], cellSet: new Set([5 + 5 * state.obstacleGrid.cols, 10 + 5 * state.obstacleGrid.cols]) }),
            isVisible: () => true,
        };
        fleePack.head.facing = Math.PI / 2;
        primeSnakeHeadVision(state, fleePack.head, getSnakeGameConfig().shared.visionRange);
        fleeInstance.autosim.tick(16);
        fleeInstance.autosim.tick(150);
        assert.equal(fleeInstance.combatAction.phase, "reacting");
        assert.equal(snakeGame.activeGunBulletIds.length, 0, "Should wait for actual aim alignment");
        fleeInstance.autosim.tick(4000);
        assert.equal(snakeGame.activeGunBulletIds.length, 1, "Should fire once aligned");
    });
    it("waits for aim alignment before burst follow-up shots", async () => {
        applySnakeGameConfig({ agentProfiles: { flee_agent: { weapon: { reactionMs: 1, fireDelayMs: 1, fireAimToleranceRad: 0.02, aimRotationRadPerSec: 0.5 } } } });
        const { state } = await createSnakeGameHarnessState();
        const { snakeGame } = wireSnakeTestGame(state);
        const fleePack = spawnGameAgentChain(state, { col: 5, row: 5 }, "flee_agent");
        const fleeInstance = new AgentInstance(state, { profileId: AGENT_PROFILE.flee, head: fleePack.head, spawnGroupId: fleePack.spawnGroupId });
        registerAgentInstance(snakeGame, "flee_agent", fleeInstance);
        fleeInstance.start();
        const snakePack = spawnSnakeChain(state, { col: 10, row: 5 }, { segmentCount: 3, spacing: 12, segmentRadius: 2, linkSlack: 0.1, faction: "alpha", exportType: "snake" });
        registerSnakeTestInstance(state, snakeGame, { headId: snakePack.chain.head.id, spawnGroupId: snakePack.chain.spawnGroupId });
        state.nav.observerVisionFrame = {
            ensureHeadVision: () => ({ cells: [{ col: 5, row: 5 }, { col: 10, row: 5 }, { col: 10, row: 9 }], cellSet: new Set([5 + 5 * state.obstacleGrid.cols, 10 + 5 * state.obstacleGrid.cols, 10 + 9 * state.obstacleGrid.cols]) }),
            isVisible: () => true,
        };
        fleePack.head.facing = 0;
        primeSnakeHeadVision(state, fleePack.head, getSnakeGameConfig().shared.visionRange);
        fleeInstance.autosim.tick(16);
        fleeInstance.autosim.tick(1);
        assert.equal(snakeGame.activeGunBulletIds.length, 1, "First shot should fire when already aligned");
        snakePack.chain.head.y += 64;
        fleeInstance.autosim.tick(150);
        assert.equal(snakeGame.activeGunBulletIds.length, 1, "Follow-up should wait after target angle changes");
        assert.equal(fleeInstance.combatAction.phase, "fire_delay");
        fleeInstance.autosim.tick(4000);
        assert.equal(snakeGame.activeGunBulletIds.length, 2, "Follow-up should fire once re-aligned");
    });
    it("fires bullets along unquantized aim rather than sprite buckets", async () => {
        applySnakeGameConfig({ agentProfiles: { flee_agent: { weapon: { reactionMs: 1, fireAimToleranceRad: 0.001, aimRotationRadPerSec: 100 } } } });
        const { state } = await createSnakeGameHarnessState();
        const { snakeGame } = wireSnakeTestGame(state);
        const fleePack = spawnGameAgentChain(state, { col: 5, row: 5 }, "flee_agent");
        const fleeInstance = new AgentInstance(state, { profileId: AGENT_PROFILE.flee, head: fleePack.head, spawnGroupId: fleePack.spawnGroupId });
        registerAgentInstance(snakeGame, "flee_agent", fleeInstance);
        fleeInstance.start();
        const snakePack = spawnSnakeChain(state, { col: 10, row: 6 }, { segmentCount: 3, spacing: 12, segmentRadius: 2, linkSlack: 0.1, faction: "alpha", exportType: "snake" });
        registerSnakeTestInstance(state, snakeGame, { headId: snakePack.chain.head.id, spawnGroupId: snakePack.chain.spawnGroupId });
        state.nav.observerVisionFrame = {
            ensureHeadVision: () => ({ cells: [{ col: 5, row: 5 }, { col: 10, row: 6 }], cellSet: new Set([5 + 5 * state.obstacleGrid.cols, 10 + 6 * state.obstacleGrid.cols]) }),
            isVisible: () => true,
        };
        primeSnakeHeadVision(state, fleePack.head, getSnakeGameConfig().shared.visionRange);
        fleeInstance.autosim.tick(16);
        fleeInstance.autosim.tick(1);
        const bullet = state.entityRegistry.getLive(snakeGame.activeGunBulletIds[0]);
        const bulletAngle = Math.atan2(bullet.vy, bullet.vx);
        const targetAngle = Math.atan2(snakePack.chain.head.y - fleePack.head.y, snakePack.chain.head.x - fleePack.head.x);
        assert.ok(Math.abs(bulletAngle - targetAngle) < 0.001);
    });
    it("smoothly rotates facing toward movement while exploring", async () => {
        applySnakeGameConfig();
        const { state } = await createSnakeGameHarnessState();
        const { snakeGame } = wireSnakeTestGame(state);
        const fleePack = spawnGameAgentChain(state, { col: 5, row: 5 }, "flee_agent");
        assert.equal(fleePack.head.type, "boid_triangle");
        const fleeInstance = new AgentInstance(state, { profileId: AGENT_PROFILE.flee, head: fleePack.head, spawnGroupId: fleePack.spawnGroupId });
        registerAgentInstance(snakeGame, "flee_agent", fleeInstance);
        fleeInstance.start();
        const food = { id: 9999, x: fleePack.head.x + 32, y: fleePack.head.y, type: "food", isDead: false, snakeFoodValue: 0.5 };
        state.entityRegistry.register(food);
        state.nav.observerVisionFrame = {
            ensureHeadVision: () => ({
                cells: [
                    { col: 5, row: 5 },
                    { col: 7, row: 5 },
                ],
                cellSet: new Set([5 + 5 * state.obstacleGrid.cols, 7 + 5 * state.obstacleGrid.cols]),
            }),
            isVisible: () => true,
        };
        const fleeAgent = fleePack.head;
        fleeAgent.facing = -Math.PI / 2;
        primeSnakeHeadVision(state, fleePack.head, getSnakeGameConfig().shared.visionRange);
        fleeInstance.autosim.tick(100);
        fleeAgent.vx = 120;
        fleeAgent.vy = 0;
        syncBallAgentFacingAfterPhysics(fleeInstance, 100);
        assert.notEqual(fleeInstance.intent.getMode(), "shoot_enemy");
        assert.ok(fleeAgent.facing > -Math.PI / 2, "Should rotate facing toward movement");
        assert.ok(fleeAgent.facing < 0, "Should rotate smoothly without snapping instantly");
    });
    it("does not charge or shoot while seeking food", async () => {
        applySnakeGameConfig();
        const { state } = await createSnakeGameHarnessState();
        const { snakeGame } = wireSnakeTestGame(state);
        const fleePack = spawnGameAgentChain(state, { col: 5, row: 5 }, "flee_agent");
        const fleeInstance = new AgentInstance(state, { profileId: AGENT_PROFILE.flee, head: fleePack.head, spawnGroupId: fleePack.spawnGroupId });
        registerAgentInstance(snakeGame, "flee_agent", fleeInstance);
        fleeInstance.start();
        const food = { id: 9999, x: fleePack.head.x + 32, y: fleePack.head.y, type: "food", isDead: false, snakeFoodValue: 0.5 };
        state.entityRegistry.register(food);
        state.nav.observerVisionFrame = {
            ensureHeadVision: () => ({
                cells: [
                    { col: 5, row: 5 },
                    { col: 7, row: 5 },
                ],
                cellSet: new Set([5 + 5 * state.obstacleGrid.cols, 7 + 5 * state.obstacleGrid.cols]),
            }),
            isVisible: () => true,
        };
        primeSnakeHeadVision(state, fleePack.head, getSnakeGameConfig().shared.visionRange);
        fleeInstance.autosim.tick(100);
        assert.notEqual(fleeInstance.intent.getMode(), "shoot_enemy");
        assert.equal(fleeInstance.combatAction.phase, "idle");
        assert.equal(snakeGame.activeGunBulletIds.length, 0, "Should not spawn any bullet");
    });
    it("reclaims projectiles immediately on wall collision", async () => {
        applySnakeGameConfig();
        const { state } = await createSnakeGameHarnessState();
        const { snakeGame } = wireSnakeTestGame(state);
        const fleePack = spawnGameAgentChain(state, { col: 5, row: 5 }, "flee_agent");
        const fleeInstance = new AgentInstance(state, { profileId: AGENT_PROFILE.flee, head: fleePack.head, spawnGroupId: fleePack.spawnGroupId });
        registerAgentInstance(snakeGame, "flee_agent", fleeInstance);
        fleeInstance.start();

        // Spawn a bullet directly
        const weapon = getSnakeGameConfig().agentProfiles.flee_agent.weapon;
        const bullet = spawnGunBulletProjectile(state, fleeInstance, 0, weapon);
        assert.equal(snakeGame.activeGunBulletIds.length, 1);
        
        const bulletId = snakeGame.activeGunBulletIds[0];
        assert.ok(bullet);
        
        // Mock a wall collision
        bullet._wallResolvedCollided = true;
        
        // Tick bullets
        tickGunBullets(state, 16);
        assert.equal(snakeGame.activeGunBulletIds.length, 0, "Bullet should be removed from active queue on wall collision");
    });
    it("allows bullet to penetrate and realistically shove a snake_shard", async () => {
        applySnakeGameConfig();
        const { state } = await createSnakeGameHarnessState();
        const { snakeGame } = wireSnakeTestGame(state);
        
        const bullet = mockKineticCircle(100, 100, 0.75, 160, 0, { id: 1001 });
        bullet._gunBullet = true;
        bullet._armed = true;
        bullet._shooterHeadId = 999;
        
        const shard = mockKineticCircle(101, 100, 1.0, 0, 0, { id: 1002 });
        shard.type = "snake_shard";
        
        const tick = createKineticTestTick([bullet, shard], { cellSize: 50 });
        const pairs = gatherKineticContactPairs(tick);
        assert.ok(pairs.count > 0, "Bullet and shard should collide");
        
        resolveKineticContactPassWithPairs(tick, pairs);
        assert.ok(kineticContactBuffer.count > 0, "Contact buffer should not be empty");
        
        resolveGunBulletContacts(state, tick.frame, kineticContactBuffer);
        
        assert.equal(bullet._armed, true, "Bullet should remain armed");
        assert.equal(bullet.vx, 160, "Bullet vx should be restored to 160 in entity");
        assert.equal(kineticDynamicSlab.vx[bullet._physId], 160, "Bullet vx should be restored to 160 in dynamic slab");
        assert.ok(kineticDynamicSlab.vx[shard._physId] > 0, "Shard vx should be greater than 0 from the physics impulse");
    });
});
