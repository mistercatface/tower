import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { EntityRegistry } from "../GameState/EntityRegistry.js";
import { KineticSession } from "../GameState/KineticSession.js";
import { SandboxWorldState } from "../GameState/SandboxWorldState.js";
import { WorldObstacleGrid } from "../Libraries/Spatial/grid/WorldObstacleGrid.js";
import { pickSnakeChainSpawnCell, spawnSnakeChain } from "../Libraries/Game/snake/snakeScene.js";
import { applySnakeGameConfig } from "../Libraries/Game/snake/snakeGameConfig.js";
import { linkedChainOccupiedCellIndices } from "../Libraries/Sandbox/spawnLinkedBallChain.js";
import { resetKineticConstraintIds } from "../Libraries/Motion/kineticConstraints.js";
import { createDefaultMapGenBoundsConfig } from "../Libraries/Sandbox/mapGenBounds.js";
import { wireSnakeTestGame } from "./harness/snakeGameHarness.js";

function createTestState() {
    const grid = new WorldObstacleGrid(16);
    grid.rebuildFixed(0, 0, 32 * 16, 32 * 16);
    const cavernConfig = createDefaultMapGenBoundsConfig();
    cavernConfig.boundsCol = 0;
    cavernConfig.boundsRow = 0;
    cavernConfig.boundsCols = 32;
    cavernConfig.boundsRows = 32;
    const state = {
        obstacleGrid: grid,
        entityRegistry: new EntityRegistry(),
        worldProps: [],
        kinetic: new KineticSession(),
        sandbox: new SandboxWorldState(),
        editor: { cavernConfig },
        nav: {
            topology: {
                canStep: (c0, r0, c1, r1) => !grid.isBlocked(c1, r1),
            },
        },
    };
    wireSnakeTestGame(state);
    return state;
}

function mockNavWalkable(cells) {
    const set = new Set(cells.map(({ col, row }) => `${col},${row}`));
    return { has: (col, row) => set.has(`${col},${row}`) };
}

describe("snake chain spawn grow direction", () => {
    it("picks a grow direction into walkable cells when the default direction hits a wall", () => {
        applySnakeGameConfig();
        resetKineticConstraintIds(9101);
        const state = createTestState();
        const navWalkable = mockNavWalkable([
            { col: 10, row: 10 },
            { col: 11, row: 10 },
            { col: 12, row: 10 },
        ]);
        const anchor = pickSnakeChainSpawnCell([{ col: 10, row: 10 }], navWalkable, state, 3, 8, -1, 0, null, () => 0);
        assert.equal(anchor.col, 10);
        assert.equal(anchor.row, 10);
        assert.equal(anchor.growDirX, 1);
        assert.equal(anchor.growDirY, 0);
    });

    it("rejects anchors with no walkable grow direction", () => {
        applySnakeGameConfig();
        resetKineticConstraintIds(9103);
        const state = createTestState();
        const navWalkable = mockNavWalkable([{ col: 10, row: 10 }]);
        assert.throws(
            () => pickSnakeChainSpawnCell([{ col: 10, row: 10 }], navWalkable, state, 3, 8, -1, 0, null, () => 0),
            /No walkable snake spawn cell with full chain clearance/,
        );
    });

    it("spawnSnakeChain uses the grow direction chosen at pick time", () => {
        applySnakeGameConfig();
        resetKineticConstraintIds(9102);
        const state = createTestState();
        const navWalkable = mockNavWalkable([
            { col: 10, row: 10 },
            { col: 11, row: 10 },
            { col: 12, row: 10 },
        ]);
        const anchor = pickSnakeChainSpawnCell([{ col: 10, row: 10 }], navWalkable, state, 3, 8, -1, 0, null, () => 0);
        const pack = spawnSnakeChain(state, anchor, { segmentCount: 3 });
        assert.ok(pack.chain.tail.x > pack.chain.head.x);
        const indices = linkedChainOccupiedCellIndices(pack.chain.members, state.obstacleGrid);
        for (const idx of indices) {
            const col = idx % state.obstacleGrid.cols;
            const row = Math.floor(idx / state.obstacleGrid.cols);
            assert.ok(navWalkable.has(col, row));
        }
    });
});
