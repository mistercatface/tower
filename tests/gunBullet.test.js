import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applySnakeGameConfig, getSnakeGameConfig } from "../Libraries/Game/snake/snakeGameConfig.js";
import { createSnakeGameHarnessState, wireSnakeTestGame, registerSnakeTestInstance, primeSnakeHeadVision } from "./harness/snakeGameHarness.js";
import { spawnSnakeChain } from "../Libraries/Game/snake/snakeScene.js";
import { createAgentInstance } from "../Libraries/Game/snake/AgentInstance.js";
import { AGENT_PROFILE } from "../Libraries/AI/agents/agentProfile.js";
import { spawnGameAgentChain } from "../Libraries/Game/snake/spawnAgentChain.js";
import { registerAgentInstance } from "../Libraries/Game/snake/snakeAgentSession.js";
import { hasLineOfSight } from "../Libraries/Game/snake/rangedCombat.js";
import { resolveGunBulletContacts, tickGunBullets } from "../Libraries/Game/snake/gunAgent/gunBulletSystem.js";
import { createKineticTestTick, mockKineticCircle } from "./harness/kineticTickHarness.js";
import { gatherKineticContactPairs, kineticContactBuffer, resolveKineticContactPassWithPairs } from "../Libraries/Spatial/collision/kineticContactSolver.js";
import { getPropCategoryIndex } from "../GameState/SandboxWorldState.js";
import { syncBallAgentFacingAfterPhysics } from "../Libraries/Game/snake/ballAgent.js";
import { isSnakeFoodTarget } from "../Libraries/Game/snake/snakeFood.js";
describe("flee agent bullets and combat", () => {
    it("can spawn flee agents, shoot bullets, perform LOS check, resolve combat kills, and transition spent bullets to food", async () => {
        applySnakeGameConfig();
        const { state } = await createSnakeGameHarnessState();
        const { snakeGame } = wireSnakeTestGame(state);
        const fleePack = spawnGameAgentChain(state, { col: 5, row: 5 }, "flee_agent");
        const fleeInstance = createAgentInstance(state, { profileId: AGENT_PROFILE.flee, head: fleePack.head, spawnGroupId: fleePack.spawnGroupId });
        registerAgentInstance(snakeGame, "flee_agent", fleeInstance);
        fleeInstance.start(state);
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
        const canSee = hasLineOfSight(state, fleePack.head, snakePack.chain.head);
        assert.ok(canSee, "Flee agent should see snake");
        primeSnakeHeadVision(state, fleePack.head, getSnakeGameConfig().shared.visionRange);
        assert.equal(snakeGame.activeGunBulletIds.length, 0);
        fleeInstance.tick(state, 16);
        assert.equal(fleeInstance.intent.getMode(), "shoot_enemy");
        assert.equal(fleeInstance.combatAction.phase, "reacting");
        assert.equal(snakeGame.activeGunBulletIds.length, 0, "Should not spawn bullet immediately");
        assert.equal(fleePack.head._groundRollDrive?.kind, "brake", "Should brake and decelerate while reacting");
        fleeInstance.tick(state, 150);
        assert.equal(snakeGame.activeGunBulletIds.length, 1, "Should spawn one bullet after reacting");
        assert.equal(fleeInstance.combatAction.phase, "fire_delay");
        fleeInstance.tick(state, 150);
        assert.equal(snakeGame.activeGunBulletIds.length, 2, "Should spawn second bullet after fire delay");
        assert.equal(fleeInstance.combatAction.phase, "fire_delay");
        fleeInstance.tick(state, 150);
        assert.equal(snakeGame.activeGunBulletIds.length, 3, "Should spawn third bullet after fire delay");
        assert.equal(fleeInstance.combatAction.phase, "reloading");
        fleeInstance.tick(state, 500);
        assert.equal(fleeInstance.combatAction.phase, "idle", "Should return to idle after reloading");
        const bulletId = snakeGame.activeGunBulletIds[0];
        const bullet = state.entityRegistry.getLive(bulletId);
        assert.ok(bullet, "Bullet prop must exist");
        assert.equal(bullet._gunBullet, true);
        assert.equal(bullet._armed, true);
        assert.equal(bullet._shooterHeadId, fleeInstance.headId);
        const head = snakePack.chain.head;
        const mockHead = mockKineticCircle(head.x, head.y, head.radius ?? 2, -100, 0, { id: head.id });
        const mockBullet = mockKineticCircle(head.x - (head.radius ?? 2) - (bullet.radius ?? 1.5) + 2, head.y, bullet.radius ?? 1.5, 100, 0, { id: bullet.id });
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
        assert.ok(isSnakeFoodTarget(bullet), "Bullet should be categorized as edible food target");
        const foodIndex = getPropCategoryIndex(state, "food");
        const found = foodIndex.findNearest(bullet.x, bullet.y);
        assert.equal(found?.id, bullet.id, "Spent bullet food should be registered in category index");
    });
    it("smoothly rotates toward target while charging", async () => {
        applySnakeGameConfig();
        const { state } = await createSnakeGameHarnessState();
        const { snakeGame } = wireSnakeTestGame(state);
        const fleePack = spawnGameAgentChain(state, { col: 5, row: 5 }, "flee_agent");
        const fleeInstance = createAgentInstance(state, { profileId: AGENT_PROFILE.flee, head: fleePack.head, spawnGroupId: fleePack.spawnGroupId });
        registerAgentInstance(snakeGame, "flee_agent", fleeInstance);
        fleeInstance.start(state);
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
        fleeInstance.tick(state, 100);
        assert.equal(fleeInstance.intent.getMode(), "shoot_enemy");
        assert.ok(fleeAgent.facing > 0, "Should start rotating toward the target");
        assert.ok(fleeAgent.facing < Math.atan2(snakePack.chain.head.y - fleeAgent.y, snakePack.chain.head.x - fleeAgent.x) + 1e-4, "Should rotate smoothly without snapping instantly");
    });
    it("smoothly rotates facing toward movement while exploring", async () => {
        applySnakeGameConfig();
        const { state } = await createSnakeGameHarnessState();
        const { snakeGame } = wireSnakeTestGame(state);
        const fleePack = spawnGameAgentChain(state, { col: 5, row: 5 }, "flee_agent");
        assert.equal(fleePack.head.type, "boid_triangle");
        const fleeInstance = createAgentInstance(state, { profileId: AGENT_PROFILE.flee, head: fleePack.head, spawnGroupId: fleePack.spawnGroupId });
        registerAgentInstance(snakeGame, "flee_agent", fleeInstance);
        fleeInstance.start(state);
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
        fleeInstance.tick(state, 100);
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
        const fleeInstance = createAgentInstance(state, { profileId: AGENT_PROFILE.flee, head: fleePack.head, spawnGroupId: fleePack.spawnGroupId });
        registerAgentInstance(snakeGame, "flee_agent", fleeInstance);
        fleeInstance.start(state);
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
        fleeInstance.tick(state, 100);
        assert.notEqual(fleeInstance.intent.getMode(), "shoot_enemy");
        assert.equal(fleeInstance.combatAction.phase, "idle");
        assert.equal(snakeGame.activeGunBulletIds.length, 0, "Should not spawn any bullet");
    });
});
