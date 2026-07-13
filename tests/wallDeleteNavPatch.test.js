import "./nodeCanvasSetup.js";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createDefaultMapGenBoundsConfig } from "../Libraries/Spatial/spatial.js";
import { clearRailWallsQuiet, clearVoxelWallsQuiet, stampRailWallsQuiet, createDeferredGridWallCommit, RailWallBatch, unionCellBounds, commitGridWallBatch } from "../Libraries/Spatial/spatial.js";
import {  isRailWallEdge  } from "../Libraries/Spatial/spatial.js";
import {  cellIsStaticWall  } from "../Libraries/Spatial/spatial.js";
import { worldIdxAtCell } from "./harness/testGridUtils.js";
import {  WorldObstacleGrid  } from "../Libraries/Spatial/spatial.js";
import { createWorkerNavigation, terminateWorkerNavigation } from "./WorkerNavigationFactory.js";
import { getNavWalkableCellIndex } from "../Libraries/Navigation/navigation.js";
import { gameWorldSurfaceSettings } from "../Render/WorldSurfaceBootstrap.js";
import { createSandboxSessionState } from "./harness/stateFactories.js";

function pickNavWalkableCell(state, rng = Math.random, boundsConfig = state.editor.cavernConfig, floodSeedBounds = null, excludeIndices = null) {
    const cells = getNavWalkableCellIndex(state, boundsConfig, floodSeedBounds).cells;
    const candidates = excludeIndices ? cells.filter((idx) => !excludeIndices.has(idx)) : cells;
    if (!candidates.length) return null;
    return candidates[Math.floor(rng() * candidates.length)];
}
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
        ...createSandboxSessionState({ cavernConfig: config }),
        obstacleGrid: grid,
        worldSurfaces: { settings: gameWorldSurfaceSettings, invalidateGridBounds: () => {} },
        nav: navigation,
        get notifyCount() {
            return notifyCount;
        },
        resetNotifyCount() {
            notifyCount = 0;
        },
    };
    return state;
}
function clearGridWallsAndCommit(state, { voxels = [], rails = [] } = {}) {
    const bounds = unionCellBounds(clearVoxelWallsQuiet(state, voxels), clearRailWallsQuiet(state, rails));
    commitGridWallBatch(state, bounds);
    return bounds;
}
function stampVoxelQuiet(state, col, row, heightLevel = 1) {
    const grid = state.obstacleGrid;
    grid.grid[worldIdxAtCell(state.obstacleGrid, col, row)] = heightLevel;
    grid.gridTopologyEpoch++;
}
describe("wall delete batching (4a)", () => {
    it("quiet voxel+rail clear removes walls without notifying", async () => {
        const state = await createWallDeleteTestState();
        stampVoxelQuiet(state, 2, 2);
        stampRailWallsQuiet(state, RailWallBatch.single(worldIdxAtCell(state.obstacleGrid, 3, 3), 1));
        const voxels = [worldIdxAtCell(state.obstacleGrid,2, 2)];
        const rails = RailWallBatch.single(worldIdxAtCell(state.obstacleGrid, 3, 3), 1);
        const bounds = unionCellBounds(clearVoxelWallsQuiet(state, voxels), clearRailWallsQuiet(state, rails));
        assert.ok(bounds);
        assert.equal(state.notifyCount, 0);
        assert.ok(!cellIsStaticWall(state.obstacleGrid, worldIdxAtCell(state.obstacleGrid,2, 2)));
        assert.ok(!isRailWallEdge(state.obstacleGrid.getCellEdge(worldIdxAtCell(state.obstacleGrid,3, 3), 1)));
        terminateWorkerNavigation(state.nav);
    });
    it("quiet+commit deletes voxel and rail in one nav invalidation", async () => {
        const state = await createWallDeleteTestState();
        stampVoxelQuiet(state, 1, 1);
        stampRailWallsQuiet(state, RailWallBatch.single(worldIdxAtCell(state.obstacleGrid, 4, 4), 0));
        state.resetNotifyCount();
        const bounds = clearGridWallsAndCommit(state, {
            voxels: [worldIdxAtCell(state.obstacleGrid,1, 1)],
            rails: RailWallBatch.single(worldIdxAtCell(state.obstacleGrid, 4, 4), 0),
        });
        assert.ok(bounds);
        assert.equal(state.notifyCount, 1);
        assert.ok(!cellIsStaticWall(state.obstacleGrid, worldIdxAtCell(state.obstacleGrid,1, 1)));
        assert.ok(!isRailWallEdge(state.obstacleGrid.getCellEdge(worldIdxAtCell(state.obstacleGrid,4, 4), 0)));
        terminateWorkerNavigation(state.nav);
    });
    it("deferred commit batches mixed voxel and rail clears into one notify", async () => {
        const state = await createWallDeleteTestState();
        stampVoxelQuiet(state, 5, 5);
        stampRailWallsQuiet(state, RailWallBatch.single(worldIdxAtCell(state.obstacleGrid, 6, 6), 2));
        const commit = createDeferredGridWallCommit(state);
        assert.ok(commit.clearVoxel(worldIdxAtCell(state.obstacleGrid,5, 5)));
        assert.ok(commit.clearRails(RailWallBatch.single(worldIdxAtCell(state.obstacleGrid, 6, 6), 2)));
        assert.equal(state.notifyCount, 0);
        assert.ok(commit.hasPending);
        assert.ok(commit.flush());
        assert.equal(state.notifyCount, 1);
        assert.ok(!cellIsStaticWall(state.obstacleGrid, worldIdxAtCell(state.obstacleGrid,5, 5)));
        assert.ok(!isRailWallEdge(state.obstacleGrid.getCellEdge(worldIdxAtCell(state.obstacleGrid,6, 6), 2)));
        terminateWorkerNavigation(state.nav);
    });
    it("deferred clearWalls batches voxel and rail in one flush", async () => {
        const state = await createWallDeleteTestState();
        stampVoxelQuiet(state, 2, 6);
        stampRailWallsQuiet(state, RailWallBatch.single(worldIdxAtCell(state.obstacleGrid, 3, 6), 1));
        const commit = createDeferredGridWallCommit(state);
        assert.ok(commit.clearWalls({
            voxels: [worldIdxAtCell(state.obstacleGrid,2, 6)],
            rails: RailWallBatch.single(worldIdxAtCell(state.obstacleGrid, 3, 6), 1),
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
        getNavWalkableCellIndex(state);
        const picked = pickNavWalkableCell(state, () => 0);
        assert.ok(picked !== null && picked !== undefined);
        const idx = picked;
        const cols = state.obstacleGrid.cols;
        stampVoxelQuiet(state, idx % cols, (idx / cols) | 0);
        await state.nav.commitEdit(idx);
        assert.equal(getNavWalkableCellIndex(state).flags[idx], 0);
        state.resetNotifyCount();
        clearVoxelWallsQuiet(state, [idx]);
        await state.nav.commitEdit(idx);
        assert.equal(state.notifyCount, 1);
        assert.ok(getNavWalkableCellIndex(state).flags[idx] !== 0);
        terminateWorkerNavigation(state.nav);
    });
    it("rail delete restores canStep through the cleared edge", async () => {
        const state = await createWallDeleteTestState();
        const grid = state.obstacleGrid;
        const col = 3;
        const row = 4;
        const nextCol = 4;
        const idx = worldIdxAtCell(state.obstacleGrid, col, row);
        const nextIdx = worldIdxAtCell(state.obstacleGrid, nextCol, row);
        stampRailWallsQuiet(state, RailWallBatch.single(worldIdxAtCell(state.obstacleGrid, col, row), 1));
        await state.nav.commitEdit(idx);
        assert.equal(grid.canStep(idx, nextIdx, state.nav.topology), false);
        state.resetNotifyCount();
        clearRailWallsQuiet(state, RailWallBatch.single(idx, 1));
        await state.nav.commitEdit(idx);
        assert.equal(state.notifyCount, 1);
        assert.equal(grid.canStep(idx, nextIdx, state.nav.topology), true);
        terminateWorkerNavigation(state.nav);
    });
    it("mixed voxel+rail batch delete updates nav context once", async () => {
        const state = await createWallDeleteTestState();
        const grid = state.obstacleGrid;
        getNavWalkableCellIndex(state);
        const blocked = pickNavWalkableCell(state, () => 0);
        assert.ok(blocked !== null && blocked !== undefined);
        const idxBlocked = blocked;
        stampVoxelQuiet(state, idxBlocked % grid.cols, (idxBlocked / grid.cols) | 0);
        stampRailWallsQuiet(state, RailWallBatch.single(worldIdxAtCell(state.obstacleGrid, 5, 5), 1));
        const idxRail = worldIdxAtCell(state.obstacleGrid, 5, 5);
        const idxNext = worldIdxAtCell(state.obstacleGrid, 6, 5);
        await state.nav.commitEdit(idxBlocked);
        grid.gridTopologyEpoch++;
        await state.nav.commitEdit(idxRail);
        assert.equal(getNavWalkableCellIndex(state).flags[idxBlocked], 0);
        assert.equal(grid.canStep(idxRail, idxNext, state.nav.topology), false);
        state.resetNotifyCount();
        const bounds = clearGridWallsAndCommit(state, {
            voxels: [idxBlocked],
            rails: RailWallBatch.single(idxRail, 1),
        });
        await state.nav.awaitWorkerNavReady();
        assert.equal(state.notifyCount, 1);
        assert.ok(getNavWalkableCellIndex(state).flags[idxBlocked] !== 0);
        assert.equal(grid.canStep(idxRail, idxNext, state.nav.topology), true);
        assert.ok(bounds);
        terminateWorkerNavigation(state.nav);
    });
});
