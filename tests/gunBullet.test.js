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
        gunInstance.autosim.getTargetId = () => snakePack.chain.head.id;
        
        assert.equal(snakeGame.activeGunBulletIds.length, 0);
        tickGunAgentShooting(state, gunInstance, 100);
        assert.equal(snakeGame.activeGunBulletIds.length, 1, "Should spawn one bullet");
        
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
});
