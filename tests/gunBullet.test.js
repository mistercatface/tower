import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applySnakeGameConfig } from "../Libraries/Game/snake/snakeGameConfig.js";
import { createSnakeGameHarnessState, wireSnakeTestGame, registerSnakeTestInstance } from "./harness/snakeGameHarness.js";
import { spawnSnakeChain } from "../Libraries/Game/snake/snakeScene.js";
import { createAgentInstance } from "../Libraries/Game/snake/AgentInstance.js";
import { AGENT_PROFILE } from "../Libraries/AI/agents/agentProfile.js";
import { spawnGunAgent } from "../Libraries/Game/snake/spawnAgentChain.js";
import { registerAgentInstance } from "../Libraries/Game/snake/snakeAgentSession.js";
import { hasLineOfSight, tickGunAgentShooting } from "../Libraries/Game/snake/gunAgent/gunAgentShooting.js";
import { resolveGunBulletContacts } from "../Libraries/Game/snake/gunAgent/gunBulletContacts.js";
import { tickGunBullets } from "../Libraries/Game/snake/gunAgent/gunBulletLifecycle.js";
import { attachKineticTestTickFromState } from "./harness/kineticTickHarness.js";
import { gatherKineticContactPairs, kineticContactBuffer, resolveKineticContactPassWithPairs } from "../Libraries/Spatial/collision/kineticContactSolver.js";
import { getPropCategoryIndex } from "../GameState/SandboxWorldState.js";
import { isSnakeFoodTarget } from "../Libraries/Game/snake/snakeFood.js";

describe("gun agent bullets and combat", () => {
    it("can spawn gun agents, shoot bullets, perform LOS check, resolve combat kills, and transition spent bullets to food", async () => {
        applySnakeGameConfig();
        const { state } = await createSnakeGameHarnessState();
        const { snakeGame } = wireSnakeTestGame(state);
        
        // 1. Spawning
        const gunPack = spawnGunAgent(state, { col: 5, row: 5 });
        const gunInstance = createAgentInstance(state, { profileId: AGENT_PROFILE.gun, head: gunPack.head, spawnGroupId: gunPack.spawnGroupId });
        registerAgentInstance(snakeGame, "gun_agent", gunInstance);
        gunInstance.start(state);
        
        const snakePack = spawnSnakeChain(state, { col: 10, row: 5 }, { segmentCount: 3, spacing: 12, segmentRadius: 2, linkSlack: 0.1, faction: "alpha", exportType: "snake" });
        const snakeInstance = registerSnakeTestInstance(state, snakeGame, { headId: snakePack.chain.head.id, spawnGroupId: snakePack.chain.spawnGroupId });
        
        // 2. Line of Sight Check
        state.nav.observerVisionFrame = {
            ensureHeadVision: (seeker, range) => {
                return {
                    cells: [{ col: 5, row: 5 }, { col: 10, row: 5 }],
                    cellSet: new Set([
                        5 + 5 * state.obstacleGrid.cols,
                        10 + 5 * state.obstacleGrid.cols
                    ])
                };
            }
        };
        
        const canSee = hasLineOfSight(state, gunPack.head, snakePack.chain.head);
        assert.ok(canSee, "Gun agent should see snake");
        
        // 3. Shooting
        gunInstance.autosim.getMode = () => "seek_enemy";
        gunInstance.autosim.getTargetId = () => snakePack.chain.head.id;
        
        assert.equal(snakeGame.activeGunBulletIds.length, 0);
        // First tick starts the 1-second (1000ms) charge phase
        tickGunAgentShooting(state, gunInstance, 100);
        assert.equal(snakeGame.activeGunBulletIds.length, 0, "Should not spawn bullet immediately");
        assert.equal(gunPack.head._groundRollDrive?.kind, "brake", "Should brake and decelerate while charging");
        
        // Second tick completes the charge phase
        tickGunAgentShooting(state, gunInstance, 1000);
        assert.equal(snakeGame.activeGunBulletIds.length, 1, "Should spawn one bullet after charging");
        
        const bulletId = snakeGame.activeGunBulletIds[0];
        const bullet = state.entityRegistry.getLive(bulletId);
        assert.ok(bullet, "Bullet prop must exist");
        assert.equal(bullet._gunBullet, true);
        assert.equal(bullet._armed, true);
        assert.equal(bullet._shooterHeadId, gunInstance.headId);
        
        // 4. Bullet Contact Resolution
        bullet.x = snakePack.chain.head.x;
        bullet.y = snakePack.chain.head.y;
        bullet.vx = 100;
        bullet.vy = 0;
        snakePack.chain.head.vx = -100;
        snakePack.chain.head.vy = 0;
        
        const tick = attachKineticTestTickFromState(state, [bullet, snakePack.chain.head], 16);
        const pairs = gatherKineticContactPairs(tick);
        resolveKineticContactPassWithPairs(tick, pairs);
        
        resolveGunBulletContacts(state, tick.frame, kineticContactBuffer);
        
        assert.equal(snakeInstance.lifecycle, "dead", "Snake should be killed by bullet");
        assert.equal(bullet._armed, false, "Bullet should be disarmed on contact");
        
        // 5. Spent Bullet Lifecycle
        assert.equal(snakeGame.activeGunBulletIds.length, 1);
        tickGunBullets(state, 16);
        
        assert.equal(snakeGame.activeGunBulletIds.length, 0, "Disarmed bullet should be removed from active queue");
        assert.ok(isSnakeFoodTarget(bullet), "Bullet should be categorized as edible food target");
        
        const foodIndex = getPropCategoryIndex(state, "food");
        const found = foodIndex.findNearest(bullet.x, bullet.y);
        assert.equal(found?.id, bullet.id, "Spent bullet food should be registered in category index");
    });

    it("smoothly rotates towards direction of movement when idle", async () => {
        applySnakeGameConfig();
        const { state } = await createSnakeGameHarnessState();
        const { snakeGame } = wireSnakeTestGame(state);
        
        const gunPack = spawnGunAgent(state, { col: 5, row: 5 });
        const gunInstance = createAgentInstance(state, { profileId: AGENT_PROFILE.gun, head: gunPack.head, spawnGroupId: gunPack.spawnGroupId });
        registerAgentInstance(snakeGame, "gun_agent", gunInstance);
        
        const gunAgent = gunPack.head;
        gunAgent.facing = 0;
        
        // Velocity pointing downwards (90 degrees, or Math.PI / 2 rad)
        gunAgent.vx = 0;
        gunAgent.vy = 100;
        
        // No target
        gunInstance.autosim.getTargetId = () => null;
        
        // Tick 100ms
        tickGunAgentShooting(state, gunInstance, 100);
        
        // Target angle is Math.PI / 2 (~1.57). With maxStep = 1.5 * PI * 0.1 = 0.15 * PI (~0.47)
        // It should have rotated from 0 to ~0.47 rad.
        assert.ok(gunAgent.facing > 0, "Should start rotating towards moving direction");
        assert.ok(gunAgent.facing < Math.PI / 2, "Should rotate smoothly without snapping instantly");
        
        // Tick another 1000ms
        tickGunAgentShooting(state, gunInstance, 1000);
        assert.ok(Math.abs(gunAgent.facing - Math.PI / 2) < 1e-4, "Should successfully reach the direction of movement");
    });

    it("does not charge or shoot if mode is not seek_enemy", async () => {
        applySnakeGameConfig();
        const { state } = await createSnakeGameHarnessState();
        const { snakeGame } = wireSnakeTestGame(state);
        
        const gunPack = spawnGunAgent(state, { col: 5, row: 5 });
        const gunInstance = createAgentInstance(state, { profileId: AGENT_PROFILE.gun, head: gunPack.head, spawnGroupId: gunPack.spawnGroupId });
        registerAgentInstance(snakeGame, "gun_agent", gunInstance);
        
        // Mock target but set mode to seek_food (e.g. hungry seeking shards)
        gunInstance.autosim.getMode = () => "seek_food";
        gunInstance.autosim.getTargetId = () => 9999;
        
        // Mock target to exist and be alive
        const originalGetLive = state.entityRegistry.getLive;
        state.entityRegistry.getLive = (id) => {
            if (id === 9999) return { id: 9999, x: 100, y: 100, isDead: false };
            return originalGetLive.call(state.entityRegistry, id);
        };
        
        // Mock LOS
        state.nav.observerVisionFrame = {
            ensureHeadVision: () => ({
                cells: [{ col: 5, row: 5 }],
                cellSet: new Set([5 + 5 * state.obstacleGrid.cols])
            })
        };
        
        tickGunAgentShooting(state, gunInstance, 100);
        assert.equal(gunPack.head._shootChargeMs ?? 0, 0, "Should not start charging");
        assert.equal(snakeGame.activeGunBulletIds.length, 0, "Should not spawn any bullet");
    });
});
