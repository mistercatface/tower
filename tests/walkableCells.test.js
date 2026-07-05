import "./nodeCanvasSetup.js";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createDefaultMapGenBoundsConfig } from "../Libraries/Spatial/spatial.js";
import { getNavWalkableCellIndex, isNavWalkableCellAt, patchNavWalkableCellIndex, pickWalkableCell, pickNavWalkableCell, isNavWalkableAt, isNavWalkableCell } from "../Libraries/Navigation/navigation.js";
import { createWorkerNavigation, terminateWorkerNavigation } from "./WorkerNavigationFactory.js";
import {  WorldObstacleGrid  } from "../Libraries/Spatial/spatial.js";
import { worldIdxAtCell } from "./harness/testGridUtils.js";
import {  GRID_NAV_EPOCH, bumpGridNavEpoch  } from "../Libraries/Spatial/spatial.js";
async function createWalkableCellsTestState(config) {
    const grid = new WorldObstacleGrid(16);
    grid.rebuildFixed(0, 0, config.boundsCols * 16, config.boundsRows * 16);
    const navigation = await createWorkerNavigation(grid);
    return { obstacleGrid: grid, editor: { cavernConfig: config }, sandbox: {}, nav: navigation };
}
describe("walkableCells", () => {
    it("getNavWalkableCellIndex skips blocked grid cells inside bounds", async () => {
        const config = createDefaultMapGenBoundsConfig();
        config.boundsIdx = 0;
        config.boundsCols = 8;
        config.boundsRows = 8;
        const state = await createWalkableCellsTestState(config);
        const blockedCol = 3;
        const blockedRow = 4;
        state.obstacleGrid.grid[worldIdxAtCell(state.obstacleGrid,blockedCol, blockedRow)] = 1;
        const index = getNavWalkableCellIndex(state);
        assert.ok(index.cells.length > 0);
        assert.ok(!isNavWalkableAt(index, worldIdxAtCell(state.obstacleGrid, blockedCol, blockedRow)));
        terminateWorkerNavigation(state.nav);
    });
    it("getNavWalkableCellIndex skips blocked voxels", async () => {
        const config = createDefaultMapGenBoundsConfig();
        config.boundsIdx = 0;
        config.boundsCols = 8;
        config.boundsRows = 8;
        const state = await createWalkableCellsTestState(config);
        state.obstacleGrid.grid[worldIdxAtCell(state.obstacleGrid,3, 3)] = 1;
        getNavWalkableCellIndex(state);
        assert.ok(!isNavWalkableCellAt(state, worldIdxAtCell(state.obstacleGrid,3, 3)));
        terminateWorkerNavigation(state.nav);
    });
    it("getNavWalkableCellIndex rebakes when navigation epoch changes", async () => {
        const config = createDefaultMapGenBoundsConfig();
        config.boundsIdx = 0;
        config.boundsCols = 8;
        config.boundsRows = 8;
        const state = await createWalkableCellsTestState(config);
        getNavWalkableCellIndex(state);
        const before = getNavWalkableCellIndex(state).cells.length;
        state.obstacleGrid.grid[worldIdxAtCell(state.obstacleGrid,2, 2)] = 1;
        bumpGridNavEpoch(state.obstacleGrid, GRID_NAV_EPOCH.Wall);
        await state.nav.commitEdit({ startCol: 2, endCol: 2, startRow: 2, endRow: 2 });
        getNavWalkableCellIndex(state);
        assert.ok(getNavWalkableCellIndex(state).cells.length <= before);
        assert.ok(!isNavWalkableCellAt(state, worldIdxAtCell(state.obstacleGrid,2, 2)));
        terminateWorkerNavigation(state.nav);
    });
    it("stores nav-walkable cells in a dense flag grid", async () => {
        const config = createDefaultMapGenBoundsConfig();
        config.boundsIdx = 0;
        config.boundsCols = 8;
        config.boundsRows = 8;
        const state = await createWalkableCellsTestState(config);
        const index = getNavWalkableCellIndex(state, config);
        assert.ok(index.flags instanceof Uint8Array);
        assert.equal(index.flags.length, state.obstacleGrid.cols * state.obstacleGrid.rows);
        const picked = pickNavWalkableCell(state, () => 0);
        assert.ok(isNavWalkableAt(index, picked));
        terminateWorkerNavigation(state.nav);
    });
    it("patchNavWalkableCellIndex rebakes cached bounds after obstacle epoch bump", async () => {
        const config = createDefaultMapGenBoundsConfig();
        config.boundsIdx = 0;
        config.boundsCols = 8;
        config.boundsRows = 8;
        const state = await createWalkableCellsTestState(config);
        state.nav.setNavWalkableSyncHook((damageBounds) => patchNavWalkableCellIndex(state, damageBounds));
        getNavWalkableCellIndex(state);
        const picked = pickNavWalkableCell(state, () => 0);
        assert.ok(picked !== null && picked !== undefined);
        const idx = picked;
        state.obstacleGrid.grid[idx] = 1;
        await state.nav.commitEdit(idx);
        assert.ok(!isNavWalkableCellAt(state, picked));
        terminateWorkerNavigation(state.nav);
    });
    it("pickNavWalkableCell only returns baked nav-walkable cells", async () => {
        const config = createDefaultMapGenBoundsConfig();
        config.boundsIdx = 0;
        config.boundsCols = 8;
        config.boundsRows = 8;
        const state = await createWalkableCellsTestState(config);
        getNavWalkableCellIndex(state);
        const picked = pickNavWalkableCell(state, () => 0);
        assert.ok(picked !== null && picked !== undefined);
        assert.ok(isNavWalkableCellAt(state, picked));
        assert.ok(isNavWalkableCell(state.obstacleGrid, state.nav.topology, picked));
        terminateWorkerNavigation(state.nav);
    });
    it("pickWalkableCell respects exclude indices", () => {
        const grid = new WorldObstacleGrid(16);
        grid.rebuildFixed(0, 0, 8 * 16, 8 * 16);
        const cells = [
            worldIdxAtCell(grid, 1, 1),
            worldIdxAtCell(grid, 2, 2),
            worldIdxAtCell(grid, 3, 3),
        ];
        const excludeIndices = new Set([worldIdxAtCell(grid, 2, 2)]);
        const picked = pickWalkableCell(cells, 8, excludeIndices, () => 0.9);
        assert.equal(picked, worldIdxAtCell(grid, 3, 3));
    });
    it("pickNavWalkableCell returns null when every cell is excluded", async () => {
        const config = createDefaultMapGenBoundsConfig();
        config.boundsIdx = 0;
        config.boundsCols = 4;
        config.boundsRows = 4;
        const state = await createWalkableCellsTestState(config);
        const open = getNavWalkableCellIndex(state).cells;
        const excludeIndices = new Set(open);
        assert.equal(pickNavWalkableCell(state, Math.random, config, null, excludeIndices), null);
        terminateWorkerNavigation(state.nav);
    });
});
