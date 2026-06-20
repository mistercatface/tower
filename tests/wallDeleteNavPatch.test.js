import "./nodeCanvasSetup.js";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createDefaultMapGenBoundsConfig } from "../Libraries/Sandbox/mapGenBounds.js";
import { createDeferredGridWallCommit } from "../Libraries/Sandbox/deferredGridWallCommit.js";
import {
    clearGridWallsBatch,
    clearGridWallsQuiet,
    clearRailWallsQuiet,
    clearVoxelWallsQuiet,
    stampRailWallsQuiet,
} from "../Libraries/Sandbox/gridWallEdit.js";
import { isRailWallEdge } from "../Libraries/Spatial/grid/CellEdge.js";
import { cellIsStaticWall } from "../Libraries/Spatial/grid/gridCellTopology.js";
import { colRowToIndex } from "../Libraries/Spatial/grid/GridUtils.js";
import { WorldObstacleGrid } from "../Libraries/Spatial/grid/WorldObstacleGrid.js";
import { createTestNavigation, terminateTestNavigation } from "./harness/workerNavigationHarness.js";
import {
    collectNavWalkableCells,
    isNavWalkableCellAt,
    patchNavWalkableCellIndex,
    pickNavWalkableCell,
} from "../Libraries/Procedural/Mazes/walkableCells.js";
import { getGameWorldSurfaceSettings } from "../Render/WorldSurfaceBootstrap.js";

async function createWallDeleteTestState() {
    const config = createDefaultMapGenBoundsConfig();
    config.boundsCol = 0;
    config.boundsRow = 0;
    config.boundsCols = 8;
    config.boundsRows = 8;
    const grid = new WorldObstacleGrid(16);
    grid.rebuildFixed(0, 0, config.boundsCols * 16, config.boundsRows * 16);
    let notifyCount = 0;
    const navigation = await createTestNavigation(grid);
    const baseOnObstaclesChanged = navigation.onObstaclesChanged.bind(navigation);
    navigation.onObstaclesChanged = (damageBounds) => {
        notifyCount++;
        return baseOnObstaclesChanged(damageBounds);
    };
    const state = {
        obstacleGrid: grid,
        editor: { cavernConfig: config },
        sandbox: {},
        worldSurfaces: { settings: getGameWorldSurfaceSettings(), invalidateGridBounds: () => {} },
        navigation,
        get notifyCount() {
            return notifyCount;
        },
        resetNotifyCount() {
            notifyCount = 0;
        },
    };
    state.navigation.setNavWalkableSyncHook((damageBounds) => patchNavWalkableCellIndex(state, damageBounds));
    return state;
}

function stampVoxelQuiet(state, col, row, heightLevel = 1) {
    const grid = state.obstacleGrid;
    grid.grid[colRowToIndex(col, row, grid.cols)] = heightLevel;
}

describe("wall delete batching (4a)", () => {
    it("clearGridWallsQuiet removes voxel and rail walls without notifying", async () => {
        const state = await createWallDeleteTestState();
        stampVoxelQuiet(state, 2, 2);
        stampRailWallsQuiet(state, [{ col: 3, row: 3, side: 1, heightLevel: 1, thicknessLevel: 1 }]);
        const bounds = clearGridWallsQuiet(state, { voxels: [{ col: 2, row: 2 }], rails: [{ col: 3, row: 3, side: 1 }] });
        assert.ok(bounds);
        assert.equal(state.notifyCount, 0);
        assert.ok(!cellIsStaticWall(state.obstacleGrid, 2, 2));
        assert.ok(!isRailWallEdge(state.obstacleGrid.edgeStore.get(3, 3, 1, state.obstacleGrid.cols)));
        terminateTestNavigation(state.navigation);
    });

    it("clearGridWallsBatch deletes voxel and rail in one nav invalidation", async () => {
        const state = await createWallDeleteTestState();
        stampVoxelQuiet(state, 1, 1);
        stampRailWallsQuiet(state, [{ col: 4, row: 4, side: 0, heightLevel: 1, thicknessLevel: 1 }]);
        state.resetNotifyCount();
        const bounds = clearGridWallsBatch(state, {
            voxels: [{ col: 1, row: 1 }],
            rails: [{ col: 4, row: 4, side: 0 }],
        });
        assert.ok(bounds);
        assert.equal(state.notifyCount, 1);
        assert.ok(!cellIsStaticWall(state.obstacleGrid, 1, 1));
        assert.ok(!isRailWallEdge(state.obstacleGrid.edgeStore.get(4, 4, 0, state.obstacleGrid.cols)));
        terminateTestNavigation(state.navigation);
    });

    it("deferred commit batches mixed voxel and rail clears into one notify", async () => {
        const state = await createWallDeleteTestState();
        stampVoxelQuiet(state, 5, 5);
        stampRailWallsQuiet(state, [{ col: 6, row: 6, side: 2, heightLevel: 1, thicknessLevel: 1 }]);
        const commit = createDeferredGridWallCommit(state);
        assert.ok(commit.clearVoxel(5, 5));
        assert.ok(commit.clearRails([{ col: 6, row: 6, side: 2 }]));
        assert.equal(state.notifyCount, 0);
        assert.ok(commit.pendingBounds);
        const bounds = commit.flush();
        assert.ok(bounds);
        assert.equal(state.notifyCount, 1);
        assert.ok(!cellIsStaticWall(state.obstacleGrid, 5, 5));
        assert.ok(!isRailWallEdge(state.obstacleGrid.edgeStore.get(6, 6, 2, state.obstacleGrid.cols)));
        terminateTestNavigation(state.navigation);
    });

    it("deferred clearWalls batches voxel and rail in one flush", async () => {
        const state = await createWallDeleteTestState();
        stampVoxelQuiet(state, 2, 6);
        stampRailWallsQuiet(state, [{ col: 3, row: 6, side: 1, heightLevel: 1, thicknessLevel: 1 }]);
        const commit = createDeferredGridWallCommit(state);
        assert.ok(commit.clearWalls({ voxels: [{ col: 2, row: 6 }], rails: [{ col: 3, row: 6, side: 1 }] }));
        assert.equal(state.notifyCount, 0);
        commit.flush();
        assert.equal(state.notifyCount, 1);
        terminateTestNavigation(state.navigation);
    });
});

describe("wall delete nav patch (4a)", () => {
    it("voxel delete updates nav-walkable flags in the damaged region", async () => {
        const state = await createWallDeleteTestState();
        collectNavWalkableCells(state);
        const picked = pickNavWalkableCell(state, { rng: () => 0 });
        assert.ok(picked);
        stampVoxelQuiet(state, picked.col, picked.row);
        await state.navigation.onObstaclesChanged({ startCol: picked.col, endCol: picked.col, startRow: picked.row, endRow: picked.row });
        assert.ok(!isNavWalkableCellAt(state, picked.col, picked.row));
        state.resetNotifyCount();
        const bounds = clearVoxelWallsQuiet(state, [{ col: picked.col, row: picked.row }]);
        await state.navigation.onObstaclesChanged(bounds);
        assert.equal(state.notifyCount, 1);
        assert.ok(isNavWalkableCellAt(state, picked.col, picked.row));
        terminateTestNavigation(state.navigation);
    });

    it("rail delete restores canStep through the cleared edge", async () => {
        const state = await createWallDeleteTestState();
        const grid = state.obstacleGrid;
        const col = 3;
        const row = 4;
        const nextCol = 4;
        stampRailWallsQuiet(state, [{ col, row, side: 1, heightLevel: 1, thicknessLevel: 1 }]);
        await state.navigation.onObstaclesChanged({ startCol: col, endCol: nextCol, startRow: row, endRow: row });
        assert.equal(grid.canStep(col, row, nextCol, row, state.navigation.gridNavContext), false);
        state.resetNotifyCount();
        const bounds = clearRailWallsQuiet(state, [{ col, row, side: 1 }]);
        await state.navigation.onObstaclesChanged(bounds);
        assert.equal(state.notifyCount, 1);
        assert.equal(grid.canStep(col, row, nextCol, row, state.navigation.gridNavContext), true);
        terminateTestNavigation(state.navigation);
    });

    it("mixed voxel+rail batch delete updates nav context once", async () => {
        const state = await createWallDeleteTestState();
        const grid = state.obstacleGrid;
        collectNavWalkableCells(state);
        const blocked = pickNavWalkableCell(state, { rng: () => 0 });
        assert.ok(blocked);
        stampVoxelQuiet(state, blocked.col, blocked.row);
        stampRailWallsQuiet(state, [{ col: 5, row: 5, side: 1, heightLevel: 1, thicknessLevel: 1 }]);
        await state.navigation.onObstaclesChanged({ startCol: 2, endCol: 6, startRow: 2, endRow: 6 });
        assert.ok(!isNavWalkableCellAt(state, blocked.col, blocked.row));
        assert.equal(grid.canStep(5, 5, 6, 5, state.navigation.gridNavContext), false);
        state.resetNotifyCount();
        const bounds = clearGridWallsBatch(state, {
            voxels: [{ col: blocked.col, row: blocked.row }],
            rails: [{ col: 5, row: 5, side: 1 }],
        });
        assert.equal(state.notifyCount, 1);
        assert.ok(isNavWalkableCellAt(state, blocked.col, blocked.row));
        assert.equal(grid.canStep(5, 5, 6, 5, state.navigation.gridNavContext), true);
        assert.ok(bounds);
        terminateTestNavigation(state.navigation);
    });
});
