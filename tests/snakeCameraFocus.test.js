import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadPropAssets } from "../Libraries/Props/loadPropAssets.js";
import { EntityRegistry } from "../GameState/EntityRegistry.js";
import { KineticSession } from "../GameState/KineticSession.js";
import { SandboxWorldState } from "../GameState/SandboxWorldState.js";
import { WorldObstacleGrid } from "../Libraries/Spatial/grid/WorldObstacleGrid.js";
import { createDefaultMapGenBoundsConfig } from "../Libraries/Sandbox/mapGenBounds.js";
import { resetKineticConstraintIds } from "../Libraries/Motion/kineticConstraints.js";
import { applySnakeGameConfig } from "../Libraries/Game/snake/snakeGameConfig.js";
import { spawnSnakeChain } from "../Libraries/Game/snake/snakeScene.js";
import { spawnSnakeStriker } from "../Libraries/Game/snake/snakeStriker.js";
import { killSnake } from "../Libraries/Game/snake/snakeCombat.js";
import { findSandboxCameraTargetWorldProp } from "../Libraries/Sandbox/sandboxCameraTarget.js";
import { CameraTargetCycler } from "../Libraries/Sandbox/CameraTargetCycler.js";
import { wireSnakeTestGame } from "./harness/snakeGameHarness.js";

loadPropAssets();

function createTestState(cols = 32, rows = 32) {
    const grid = new WorldObstacleGrid(16);
    grid.rebuildFixed(0, 0, cols * 16, rows * 16);
    const cavernConfig = createDefaultMapGenBoundsConfig();
    cavernConfig.boundsCol = 0;
    cavernConfig.boundsRow = 0;
    cavernConfig.boundsCols = cols;
    cavernConfig.boundsRows = rows;
    return {
        obstacleGrid: grid,
        entityRegistry: new EntityRegistry(),
        worldProps: [],
        kinetic: new KineticSession(),
        sandbox: new SandboxWorldState(),
        editor: { cavernConfig },
        nav: { settings: {}, commitEdit: async () => {}, topologyKey: () => "" },
        viewport: { snapTo() {}, follow() {} },
    };
}

describe("snake camera focus", () => {
    it("stops following when the focused head dies", () => {
        applySnakeGameConfig({ segmentCount: 3, strikerPropId: "snake_striker" });
        resetKineticConstraintIds(1);
        const state = createTestState();
        const first = spawnSnakeChain(state, { col: 8, row: 8 }, { segmentCount: 3 });
        const second = spawnSnakeChain(state, { col: 14, row: 8 }, { segmentCount: 3 });
        wireSnakeTestGame(state, [
            { headId: first.chain.head.id, spawnGroupId: first.chain.spawnGroupId },
            { headId: second.chain.head.id, spawnGroupId: second.chain.spawnGroupId },
        ]);
        const registry = state.sandbox.snakeGame.registry;
        const strikerBall = spawnSnakeStriker(state, first.chain.head);
        state.sandbox.snakeGame.strikerBall = strikerBall;
        const cameraCycler = new CameraTargetCycler(state, {
            getTargetIds: () => {
                const ids = [];
                for (const headId of registry.aliveByHeadId.keys()) ids.push(headId);
                if (strikerBall) ids.push(strikerBall.id);
                return ids;
            },
        });
        state.sandbox.snakeGame.onHeadDied = (headId) => {
            if (cameraCycler.focusedId === headId) cameraCycler.setFocusedId(null);
        };
        cameraCycler.setFocusedId(first.chain.head.id);
        killSnake(state, state.sandbox.snakeGame, first.chain.head.id);
        assert.equal(cameraCycler.focusedId, null);
        assert.equal(findSandboxCameraTargetWorldProp(state, state.entityRegistry), null);
    });
});
