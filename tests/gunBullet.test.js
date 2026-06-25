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
describe("gun agent bullets and combat", () => {
    it("can spawn gun agents, shoot bullets, perform LOS check, resolve combat kills, and transition spent bullets to food", async () => {
        applySnakeGameConfig();
        const { state } = await createSnakeGameHarnessState();
        const { snakeGame } = wireSnakeTestGame(state);
        const gunPack = spawnGameAgentChain(state, { col: 5, row: 5 }, "gun_agent");
        const gunInstance = createAgentInstance(state, { profileId: AGENT_PROFILE.gun, head: gunPack.head, spawnGroupId: gunPack.spawnGroupId });
        registerAgentInstance(snakeGame, "gun_agent", gunInstance);
        gunInstance.start(state);
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
        };
        const canSee = hasLineOfSight(state, gunPack.head, snakePack.chain.head);
        assert.ok(canSee, "Gun agent should see snake");
        primeSnakeHeadVision(state, gunPack.head, getSnakeGameConfig().shared.visionRange);
        assert.equal(snakeGame.activeGunBulletIds.length, 0);
        gunInstance.tick(state, 100);
        assert.equal(gunInstance.intent.getMode(), "shoot_enemy");
        assert.equal(gunInstance.combatAction.phase, "charging");
        assert.equal(snakeGame.activeGunBulletIds.length, 0, "Should not spawn bullet immediately");
        assert.equal(gunPack.head._groundRollDrive?.kind, "brake", "Should brake and decelerate while charging");
        gunInstance.tick(state, 1000);
        assert.equal(snakeGame.activeGunBulletIds.length, 1, "Should spawn one bullet after charging");
        const bulletId = snakeGame.activeGunBulletIds[0];
        const bullet = state.entityRegistry.getLive(bulletId);
        assert.ok(bullet, "Bullet prop must exist");
        assert.equal(bullet._gunBullet, true);
        assert.equal(bullet._armed, true);
        assert.equal(bullet._shooterHeadId, gunInstance.headId);
        const head = snakePack.chain.head;
        const mockHead = mockKineticCircle(head.x, head.y, head.radius ?? 2, -100, 0, { id: head.id });
        const mockBullet = mockKineticCircle(head.x - (head.radius ?? 2) - (bullet.radius ?? 1.5) + 2, head.y, bullet.radius ?? 1.5, 100, 0, { id: bullet.id });
        mockBullet._gunBullet = true;
        mockBullet._armed = true;
        mockBullet._shooterHeadId = gunInstance.headId;
        const tick = createKineticTestTick([mockBullet, mockHead], { cellSize: 50 });
        const pairs = gatherKineticContactPairs(tick);
        assert.ok(pairs.count > 0, "Bullet and snake head should overlap for contact pairs");
        resolveKineticContactPassWithPairs(tick, pairs);
        assert.ok(kineticContactBuffer.count > 0, "Contact solver should emit at least one contact");
        resolveGunBulletContacts(state, tick.frame, kineticContactBuffer);
        assert.equal(snakeInstance.lifecycle, "dead", "Snake should be killed by bullet");
        assert.equal(mockBullet._armed, false, "Bullet should be disarmed on contact");
        bullet._armed = false;
        assert.equal(snakeGame.activeGunBulletIds.length, 1);
        tickGunBullets(state, 16);
        assert.equal(snakeGame.activeGunBulletIds.length, 0, "Disarmed bullet should be removed from active queue");
        assert.ok(isSnakeFoodTarget(bullet), "Bullet should be categorized as edible food target");
        const foodIndex = getPropCategoryIndex(state, "food");
        const found = foodIndex.findNearest(bullet.x, bullet.y);
        assert.equal(found?.id, bullet.id, "Spent bullet food should be registered in category index");
    });
    it("smoothly rotates toward target while charging", async () => {
        applySnakeGameConfig();
        const { state } = await createSnakeGameHarnessState();
        const { snakeGame } = wireSnakeTestGame(state);
        const gunPack = spawnGameAgentChain(state, { col: 5, row: 5 }, "gun_agent");
        const gunInstance = createAgentInstance(state, { profileId: AGENT_PROFILE.gun, head: gunPack.head, spawnGroupId: gunPack.spawnGroupId });
        registerAgentInstance(snakeGame, "gun_agent", gunInstance);
        gunInstance.start(state);
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
        };
        const gunAgent = gunPack.head;
        gunAgent.facing = 0;
        primeSnakeHeadVision(state, gunPack.head, getSnakeGameConfig().shared.visionRange);
        gunInstance.tick(state, 100);
        assert.equal(gunInstance.intent.getMode(), "shoot_enemy");
        assert.ok(gunAgent.facing > 0, "Should start rotating toward the target");
        assert.ok(gunAgent.facing < Math.atan2(snakePack.chain.head.y - gunAgent.y, snakePack.chain.head.x - gunAgent.x) + 1e-4, "Should rotate smoothly without snapping instantly");
    });
    it("smoothly rotates facing toward movement while exploring", async () => {
        applySnakeGameConfig();
        const { state } = await createSnakeGameHarnessState();
        const { snakeGame } = wireSnakeTestGame(state);
        const gunPack = spawnGameAgentChain(state, { col: 5, row: 5 }, "gun_agent");
        assert.equal(gunPack.head.type, "boid_triangle");
        const gunInstance = createAgentInstance(state, { profileId: AGENT_PROFILE.gun, head: gunPack.head, spawnGroupId: gunPack.spawnGroupId });
        registerAgentInstance(snakeGame, "gun_agent", gunInstance);
        gunInstance.start(state);
        const food = { id: 9999, x: gunPack.head.x + 32, y: gunPack.head.y, type: "food", isDead: false, snakeFoodValue: 0.5 };
        state.entityRegistry.register(food);
        state.nav.observerVisionFrame = {
            ensureHeadVision: () => ({
                cells: [
                    { col: 5, row: 5 },
                    { col: 7, row: 5 },
                ],
                cellSet: new Set([5 + 5 * state.obstacleGrid.cols, 7 + 5 * state.obstacleGrid.cols]),
            }),
        };
        const gunAgent = gunPack.head;
        gunAgent.facing = -Math.PI / 2;
        primeSnakeHeadVision(state, gunPack.head, getSnakeGameConfig().shared.visionRange);
        gunInstance.tick(state, 100);
        gunAgent.vx = 120;
        gunAgent.vy = 0;
        syncBallAgentFacingAfterPhysics(gunInstance, 100);
        assert.notEqual(gunInstance.intent.getMode(), "shoot_enemy");
        assert.ok(gunAgent.facing > -Math.PI / 2, "Should rotate facing toward movement");
        assert.ok(gunAgent.facing < 0, "Should rotate smoothly without snapping instantly");
    });
    it("does not charge or shoot while seeking food", async () => {
        applySnakeGameConfig();
        const { state } = await createSnakeGameHarnessState();
        const { snakeGame } = wireSnakeTestGame(state);
        const gunPack = spawnGameAgentChain(state, { col: 5, row: 5 }, "gun_agent");
        const gunInstance = createAgentInstance(state, { profileId: AGENT_PROFILE.gun, head: gunPack.head, spawnGroupId: gunPack.spawnGroupId });
        registerAgentInstance(snakeGame, "gun_agent", gunInstance);
        gunInstance.start(state);
        const food = { id: 9999, x: gunPack.head.x + 32, y: gunPack.head.y, type: "food", isDead: false, snakeFoodValue: 0.5 };
        state.entityRegistry.register(food);
        state.nav.observerVisionFrame = {
            ensureHeadVision: () => ({
                cells: [
                    { col: 5, row: 5 },
                    { col: 7, row: 5 },
                ],
                cellSet: new Set([5 + 5 * state.obstacleGrid.cols, 7 + 5 * state.obstacleGrid.cols]),
            }),
        };
        primeSnakeHeadVision(state, gunPack.head, getSnakeGameConfig().shared.visionRange);
        gunInstance.tick(state, 100);
        assert.notEqual(gunInstance.intent.getMode(), "shoot_enemy");
        assert.equal(gunInstance.combatAction.phase, "idle");
        assert.equal(snakeGame.activeGunBulletIds.length, 0, "Should not spawn any bullet");
    });
});
