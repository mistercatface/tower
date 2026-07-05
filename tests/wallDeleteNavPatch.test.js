import "./nodeCanvasSetup.js";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createDefaultMapGenBoundsConfig } from "../Libraries/Sandbox/mapGenBounds.js";
import { clearGridWallsBatch, clearGridWallsQuiet, clearRailWallsQuiet, clearVoxelWallsQuiet, stampRailWallsQuiet, createDeferredGridWallCommit } from "../Libraries/Sandbox/gridWallEdit.js";
import {  isRailWallEdge  } from "../Libraries/Spatial/spatial.js";
import {  cellIsStaticWall  } from "../Libraries/Spatial/spatial.js";
import { colRowToIndex } from "./harness/testGridUtils.js";
import {  WorldObstacleGrid  } from "../Libraries/Spatial/spatial.js";
import { createWorkerNavigation, terminateWorkerNavigation } from "./WorkerNavigationFactory.js";
import { collectNavWalkableCells, isNavWalkableCellAt, patchNavWalkableCellIndex, pickNavWalkableCell } from "../Libraries/Procedural/Mazes/walkableCells.js";
import { gameWorldSurfaceSettings } from "../Render/WorldSurfaceBootstrap.js";
async function createWallDeleteTestState() {
    const config = createDefaultMapGenBoundsConfig();
    config.boundsIdx = 0;
    config.boundsCols = 8;
    config.boundsRows = 8;
    const grid = new WorldObstacleGrid(16);
    grid.rebuildFixed(0, 0, config.boundsCols * 16, config.boundsRows * 16);
    let notifyCount = 0;
    const navigation = await createWorkerNavigation(grid);
    const baseCommitEdit = navigation.commitEdit.bind(navigation);
    navigation.commitEdit = (damageBounds, options) => {
        notifyCount++;
        return baseCommitEdit(damageBounds, options);
    };
    const state = {
        obstacleGrid: grid,
        editor: { cavernConfig: config },
        sandbox: {},
        worldSurfaces: { settings: gameWorldSurfaceSettings, invalidateGridBounds: () => {} },
        nav: navigation,
        get notifyCount() {
            return notifyCount;
        },
        resetNotifyCount() {
            notifyCount = 0;
        },
    };
    state.nav.setNavWalkableSyncHook((damageBounds) => patchNavWalkableCellIndex(state, damageBounds));
    return state;
}
function stampVoxelQuiet(state, col, row, heightLevel = 1) {
    const grid = state.obstacleGrid;
    grid.grid[colRowToIndex(col, row, grid.cols)] = heightLevel;
    grid.gridTopologyEpoch++;
}
describe("wall delete batching (4a)", () => {
    it("clearGridWallsQuiet removes voxel and rail walls without notifying", async () => {
        const state = await createWallDeleteTestState();
        stampVoxelQuiet(state, 2, 2);
        stampRailWallsQuiet(state, [{ col: 3, row: 3, side: 1, heightLevel: 1, thicknessLevel: 1 }]);
        const bounds = clearGridWallsQuiet(state, {
            voxels: [colRowToIndex(2, 2, state.obstacleGrid.cols)],
            rails: [{ idx: colRowToIndex(3, 3, state.obstacleGrid.cols), side: 1 }]
        });
        assert.ok(bounds);
        assert.equal(state.notifyCount, 0);
        assert.ok(!cellIsStaticWall(state.obstacleGrid, colRowToIndex(2, 2, state.obstacleGrid.cols)));
        assert.ok(!isRailWallEdge(state.obstacleGrid.getCellEdge(colRowToIndex(3, 3, state.obstacleGrid.cols), 1)));
        terminateWorkerNavigation(state.nav);
    });
    it("clearGridWallsBatch deletes voxel and rail in one nav invalidation", async () => {
        const state = await createWallDeleteTestState();
        stampVoxelQuiet(state, 1, 1);
        stampRailWallsQuiet(state, [{ col: 4, row: 4, side: 0, heightLevel: 1, thicknessLevel: 1 }]);
        state.resetNotifyCount();
        const bounds = clearGridWallsBatch(state, {
            voxels: [colRowToIndex(1, 1, state.obstacleGrid.cols)],
            rails: [{ idx: colRowToIndex(4, 4, state.obstacleGrid.cols), side: 0 }]
        });
        assert.ok(bounds);
        assert.equal(state.notifyCount, 1);
        assert.ok(!cellIsStaticWall(state.obstacleGrid, colRowToIndex(1, 1, state.obstacleGrid.cols)));
        assert.ok(!isRailWallEdge(state.obstacleGrid.getCellEdge(colRowToIndex(4, 4, state.obstacleGrid.cols), 0)));
        terminateWorkerNavigation(state.nav);
    });
    it("deferred commit batches mixed voxel and rail clears into one notify", async () => {
        const state = await createWallDeleteTestState();
        stampVoxelQuiet(state, 5, 5);
        stampRailWallsQuiet(state, [{ col: 6, row: 6, side: 2, heightLevel: 1, thicknessLevel: 1 }]);
        const commit = createDeferredGridWallCommit(state);
        assert.ok(commit.clearVoxel(colRowToIndex(5, 5, state.obstacleGrid.cols)));
        assert.ok(commit.clearRails([{ idx: colRowToIndex(6, 6, state.obstacleGrid.cols), side: 2 }]));
        assert.equal(state.notifyCount, 0);
        assert.ok(commit.hasPending);
        assert.ok(commit.flush());
        assert.equal(state.notifyCount, 1);
        assert.ok(!cellIsStaticWall(state.obstacleGrid, colRowToIndex(5, 5, state.obstacleGrid.cols)));
        assert.ok(!isRailWallEdge(state.obstacleGrid.getCellEdge(colRowToIndex(6, 6, state.obstacleGrid.cols), 2)));
        terminateWorkerNavigation(state.nav);
    });
    it("deferred clearWalls batches voxel and rail in one flush", async () => {
        const state = await createWallDeleteTestState();
        stampVoxelQuiet(state, 2, 6);
        stampRailWallsQuiet(state, [{ col: 3, row: 6, side: 1, heightLevel: 1, thicknessLevel: 1 }]);
        const commit = createDeferredGridWallCommit(state);
        assert.ok(commit.clearWalls({
            voxels: [colRowToIndex(2, 6, state.obstacleGrid.cols)],
            rails: [{ idx: colRowToIndex(3, 6, state.obstacleGrid.cols), side: 1 }]
        }));
        assert.equal(state.notifyCount, 0);
        commit.flush();
        assert.equal(state.notifyCount, 1);
        terminateWorkerNavigation(state.nav);
    });
});
describe("wall delete nav patch (4a)", () => {
    it("voxel delete updates nav-walkable flags in the damaged region", async () => {
        const state = await createWallDeleteTestState();
        collectNavWalkableCells(state);
        const picked = pickNavWalkableCell(state, () => 0);
        assert.ok(picked !== null && picked !== undefined);
        const idx = picked;
        const cols = state.obstacleGrid.cols;
        stampVoxelQuiet(state, idx % cols, (idx / cols) | 0);
        await state.nav.commitEdit(idx);
        assert.ok(!isNavWalkableCellAt(state, idx));
        state.resetNotifyCount();
        clearVoxelWallsQuiet(state, [idx]);
        await state.nav.commitEdit(idx);
        assert.equal(state.notifyCount, 1);
        assert.ok(isNavWalkableCellAt(state, idx));
        terminateWorkerNavigation(state.nav);
    });
    it("rail delete restores canStep through the cleared edge", async () => {
        const state = await createWallDeleteTestState();
        const grid = state.obstacleGrid;
        const col = 3;
        const row = 4;
        const nextCol = 4;
        const idx = colRowToIndex(col, row, grid.cols);
        const nextIdx = colRowToIndex(nextCol, row, grid.cols);
        stampRailWallsQuiet(state, [{ col, row, side: 1, heightLevel: 1, thicknessLevel: 1 }]);
        await state.nav.commitEdit(idx);
        assert.equal(grid.canStep(idx, nextIdx, state.nav.topology), false);
        state.resetNotifyCount();
        clearRailWallsQuiet(state, [{ idx, side: 1 }]);
        await state.nav.commitEdit(idx);
        assert.equal(state.notifyCount, 1);
        assert.equal(grid.canStep(idx, nextIdx, state.nav.topology), true);
        terminateWorkerNavigation(state.nav);
    });
    it("mixed voxel+rail batch delete updates nav context once", async () => {
        const state = await createWallDeleteTestState();
        const grid = state.obstacleGrid;
        collectNavWalkableCells(state);
        const blocked = pickNavWalkableCell(state, () => 0);
        assert.ok(blocked !== null && blocked !== undefined);
        const idxBlocked = blocked;
        stampVoxelQuiet(state, idxBlocked % grid.cols, (idxBlocked / grid.cols) | 0);
        stampRailWallsQuiet(state, [{ col: 5, row: 5, side: 1, heightLevel: 1, thicknessLevel: 1 }]);
        const idxRail = colRowToIndex(5, 5, grid.cols);
        const idxNext = colRowToIndex(6, 5, grid.cols);
        await state.nav.commitEdit(idxBlocked);
        grid.gridTopologyEpoch++;
        await state.nav.commitEdit(idxRail);
        assert.ok(!isNavWalkableCellAt(state, idxBlocked));
        assert.equal(grid.canStep(idxRail, idxNext, state.nav.topology), false);
        state.resetNotifyCount();
        const bounds = clearGridWallsBatch(state, {
            voxels: [idxBlocked],
            rails: [{ idx: idxRail, side: 1 }]
        });
        await state.nav.awaitWorkerNavReady();
        assert.equal(state.notifyCount, 1);
        assert.ok(isNavWalkableCellAt(state, idxBlocked));
        assert.equal(grid.canStep(idxRail, idxNext, state.nav.topology), true);
        assert.ok(bounds);
        terminateWorkerNavigation(state.nav);
    });
});
