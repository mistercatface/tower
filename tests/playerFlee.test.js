import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resetKineticConstraintIds } from "../Libraries/Motion/kineticConstraints.js";
import { applySnakeGameConfig, getSnakeGameConfig } from "../Libraries/Game/snake/snakeGameConfig.js";
import { spawnGameAgentChain } from "../Libraries/Game/snake/spawnAgentChain.js";
import { AGENT_PROFILE } from "../Libraries/AI/agents/AgentProfiles.js";
import { getAgentIdentity } from "../Libraries/AI/identity/agentIdentity.js";
import { createSnakeGameHarnessState, wireSnakeTestGame } from "./harness/snakeGameHarness.js";
import { resolveRelationshipForInstances } from "../Libraries/Game/snake/AgentInstance.js";
import { setupSnakeGame } from "../Libraries/Game/snake/setupSnakeGame.js";
import { EntityRegistry } from "../GameState/EntityRegistry.js";
import { KineticSession } from "../GameState/KineticSession.js";
import { SandboxWorldState } from "../GameState/SandboxWorldState.js";
import { WorldObstacleGrid } from "../Libraries/Spatial/grid/WorldObstacleGrid.js";
import { createDefaultMapGenBoundsConfig } from "../Libraries/Sandbox/mapGenBounds.js";
import { FollowCamera } from "../Libraries/Sandbox/FollowCamera.js";

function createTestState(cols = 32, rows = 32) {
    const grid = new WorldObstacleGrid(16);
    grid.rebuildFixed(0, 0, cols * 16, rows * 16);
    const cavernConfig = createDefaultMapGenBoundsConfig();
    cavernConfig.boundsCol = 0;
    cavernConfig.boundsRow = 0;
    cavernConfig.boundsCols = cols;
    cavernConfig.boundsRows = rows;
    const state = {
        obstacleGrid: grid,
        entityRegistry: new EntityRegistry(),
        worldProps: [],
        kinetic: new KineticSession(),
        sandbox: new SandboxWorldState(),
        editor: { cavernConfig },
        nav: { settings: {}, commitEdit: async () => {}, topologyKey: () => "" },
        viewport: { snapTo() {}, follow() {} },
    };
    state.followCamera = new FollowCamera(state);
    return state;
}

describe("player flee agent", () => {
    it("spawns player_flee agent with grey color and player_flee prop type", async () => {
        resetKineticConstraintIds(1);
        const { state } = await createSnakeGameHarnessState();
        wireSnakeTestGame(state);
        
        const pack = spawnGameAgentChain(state, { col: 10, row: 10 }, AGENT_PROFILE.playerFlee);
        assert.equal(pack.members.length, 1);
        assert.equal(pack.head.type, "player_flee");
        
        const identity = getAgentIdentity(pack.head.id);
        assert.equal(identity.color, "#808080");
    });

    it("has autonomous: false and does not move/steer autonomously on tick", async () => {
        resetKineticConstraintIds(1);
        const { state } = await createSnakeGameHarnessState();
        const snakeGame = wireSnakeTestGame(state);
        
        const pack = spawnGameAgentChain(state, { col: 10, row: 10 }, AGENT_PROFILE.playerFlee);
        const instance = snakeGame.instancesByHeadId.get(pack.head.id);
        
        assert.equal(instance.profile.autonomous, false);
        
        // Give it some initial velocity and call tick
        pack.head.vx = 0;
        pack.head.vy = 0;
        pack.head.facing = 0;
        
        instance.autosim.tick(16, true);
        
        // Autonomous should not run FSM or pathfinding forces, so velocity/steering remains untouched
        assert.equal(pack.head.vx, 0);
        assert.equal(pack.head.vy, 0);
    });

    it("is resolved as prey by snakes and flee agents", async () => {
        resetKineticConstraintIds(1);
        const { state } = await createSnakeGameHarnessState();
        const snakeGame = wireSnakeTestGame(state);
        
        const playerPack = spawnGameAgentChain(state, { col: 10, row: 10 }, AGENT_PROFILE.playerFlee);
        const playerInstance = snakeGame.instancesByHeadId.get(playerPack.head.id);
        
        const snakePack = spawnGameAgentChain(state, { col: 12, row: 10 }, AGENT_PROFILE.snake);
        const snakeInstance = snakeGame.instancesByHeadId.get(snakePack.head.id);
        
        const fleePack = spawnGameAgentChain(state, { col: 14, row: 10 }, AGENT_PROFILE.flee);
        const fleeInstance = snakeGame.instancesByHeadId.get(fleePack.head.id);
        
        // Snakes see player_flee as prey
        const relationshipToSnake = resolveRelationshipForInstances(snakeInstance, playerInstance);
        assert.equal(relationshipToSnake, "prey");
        
        // Flee agents see player_flee as prey
        const relationshipToFlee = resolveRelationshipForInstances(fleeInstance, playerInstance);
        assert.equal(relationshipToFlee, "prey");
    });

    it("setupSnakeGame focuses followCamera on player_flee target", async () => {
        resetKineticConstraintIds(1);
        const state = createTestState();
        
        // Simulate setup
        const snakeGame = wireSnakeTestGame(state);
        
        // Run setup camera targeting equivalent logic or full setup
        const context = await setupSnakeGame(state);
        
        assert.equal(state.followCamera.targetProp?.type, "player_flee");
        if (context.destroy) context.destroy();
    });

    it("focusFromPropId returns false if clicked prop is already the focused target", async () => {
        resetKineticConstraintIds(1);
        const state = createTestState();
        const snakeGame = wireSnakeTestGame(state);
        
        const playerPack = spawnGameAgentChain(state, { col: 10, row: 10 }, AGENT_PROFILE.playerFlee);
        
        state.followCamera.registerPickResolver((propId) => {
            const instance = snakeGame.instancesByMemberId.get(propId);
            return instance?.lifecycle === "alive" ? instance.head : null;
        });
        
        // Focus first time -> should return true
        assert.ok(state.followCamera.focusFromPropId(playerPack.head.id));
        assert.equal(state.followCamera.targetProp, playerPack.head);
        
        // Focus second time (already focused) -> should return false
        assert.equal(state.followCamera.focusFromPropId(playerPack.head.id), false);
    });
});
