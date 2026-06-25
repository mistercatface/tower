import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { EntityRegistry } from "../GameState/EntityRegistry.js";
import { KineticSession } from "../GameState/KineticSession.js";
import { SandboxWorldState } from "../GameState/SandboxWorldState.js";
import { WorldObstacleGrid } from "../Libraries/Spatial/grid/WorldObstacleGrid.js";
import { createDefaultMapGenBoundsConfig } from "../Libraries/Sandbox/mapGenBounds.js";
import { resetKineticConstraintIds } from "../Libraries/Motion/kineticConstraints.js";
import { applySnakeGameConfig } from "../Libraries/Game/snake/snakeGameConfig.js";
import { spawnSnakeChain } from "../Libraries/Game/snake/snakeScene.js";
import { findSandboxCameraTargetWorldProp } from "../Libraries/Sandbox/sandboxCameraTarget.js";
import { FollowCamera } from "../Libraries/Sandbox/FollowCamera.js";
import { wireSnakeTestGame } from "./harness/snakeGameHarness.js";
import { resolveAliveAgentInstanceFromProp } from "../Libraries/Game/snake/resolveAliveAgentInstanceFromProp.js";
import { getConnectedBodyIds } from "../Libraries/Motion/kineticConstraintGraph.js";

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

describe("snake camera focus", () => {
    it("stops following when the focused head dies", () => {
        applySnakeGameConfig({ agentProfiles: { snake: { segmentCount: 3 } } });
        resetKineticConstraintIds(1);
        const state = createTestState();
        const first = spawnSnakeChain(state, { col: 8, row: 8 }, { segmentCount: 3 });
        const second = spawnSnakeChain(state, { col: 14, row: 8 }, { segmentCount: 3 });
        wireSnakeTestGame(state, [
            { headId: first.chain.head.id, spawnGroupId: first.chain.spawnGroupId },
            { headId: second.chain.head.id, spawnGroupId: second.chain.spawnGroupId },
        ]);
        const session = state.sandbox.snakeGame;
        const instance = session.instancesByHeadId.get(first.chain.head.id);
        state.followCamera.focus(instance.head);
        instance.kill(state, session);
        assert.equal(state.followCamera.targetProp, null);
        assert.equal(findSandboxCameraTargetWorldProp(state, state.entityRegistry), null);
    });

    it("resolves alive agent instance from any chain segment", () => {
        applySnakeGameConfig({ agentProfiles: { snake: { segmentCount: 3 } } });
        resetKineticConstraintIds(1);
        const state = createTestState();
        const chain = spawnSnakeChain(state, { col: 8, row: 8 }, { segmentCount: 3 });
        wireSnakeTestGame(state, [{ headId: chain.chain.head.id, spawnGroupId: chain.chain.spawnGroupId }]);
        const members = getConnectedBodyIds(state.kinetic, chain.chain.head.id);
        assert.ok(members.length >= 3);
        const tailId = members[members.length - 1];
        const instance = state.sandbox.snakeGame.instancesByHeadId.get(chain.chain.head.id);
        assert.equal(resolveAliveAgentInstanceFromProp(state, chain.chain.head.id), instance);
        assert.equal(resolveAliveAgentInstanceFromProp(state, tailId), instance);
        assert.equal(resolveAliveAgentInstanceFromProp(state, "missing"), null);
    });

    it("focusFromPropId snaps camera to the resolved head", () => {
        applySnakeGameConfig({ agentProfiles: { snake: { segmentCount: 3 } } });
        resetKineticConstraintIds(1);
        const state = createTestState();
        let snappedX = null;
        let snappedY = null;
        state.viewport.snapTo = (x, y) => {
            snappedX = x;
            snappedY = y;
        };
        const first = spawnSnakeChain(state, { col: 8, row: 8 }, { segmentCount: 3 });
        const second = spawnSnakeChain(state, { col: 14, row: 8 }, { segmentCount: 3 });
        wireSnakeTestGame(state, [
            { headId: first.chain.head.id, spawnGroupId: first.chain.spawnGroupId },
            { headId: second.chain.head.id, spawnGroupId: second.chain.spawnGroupId },
        ]);
        state.followCamera.registerPickResolver((propId) => {
            const instance = resolveAliveAgentInstanceFromProp(state, propId);
            return instance ? instance.head : null;
        });
        const tailId = getConnectedBodyIds(state.kinetic, second.chain.head.id).at(-1);
        assert.ok(state.followCamera.focusFromPropId(tailId));
        assert.equal(state.followCamera.targetProp, second.chain.head);
        assert.equal(snappedX, second.chain.head.x);
        assert.equal(snappedY, second.chain.head.y);
        assert.equal(findSandboxCameraTargetWorldProp(state, state.entityRegistry)?.id, second.chain.head.id);
    });
});
