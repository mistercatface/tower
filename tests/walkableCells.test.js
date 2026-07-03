import "./nodeCanvasSetup.js";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createDefaultMapGenBoundsConfig } from "../Libraries/Sandbox/mapGenBounds.js";
import { collectWalkableCells, collectNavWalkableCells, createNavWalkableAccess, getNavWalkableCellIndex, getNavWalkableCells, isNavWalkableCellAt, patchNavWalkableCellIndex, pickWalkableCell, pickNavWalkableCell, pickRandomWalkableCell, isNavWalkableAt, isNavWalkableCell } from "../Libraries/Procedural/Mazes/walkableCells.js";
import { createWorkerNavigation, terminateWorkerNavigation } from "./WorkerNavigationFactory.js";
import { WorldObstacleGrid } from "../Libraries/Spatial/grid/WorldObstacleGrid.js";
import { colRowToIndex } from "../Libraries/Spatial/grid/GridUtils.js";
import { GRID_NAV_EPOCH, bumpGridNavEpoch, gridNavCacheKey } from "../Libraries/Spatial/grid/gridNavEpoch.js";
async function createWalkableCellsTestState(config) {
    const grid = new WorldObstacleGrid(16);
    grid.rebuildFixed(0, 0, config.boundsCols * 16, config.boundsRows * 16);
    const navigation = await createWorkerNavigation(grid);
    return { obstacleGrid: grid, editor: { cavernConfig: config }, sandbox: {}, nav: navigation };
}
describe("walkableCells", () => {
    it("collectWalkableCells skips blocked grid cells inside bounds", async () => {
        const config = createDefaultMapGenBoundsConfig();
        config.boundsCol = 0;
        config.boundsRow = 0;
        config.boundsCols = 8;
        config.boundsRows = 8;
        const state = await createWalkableCellsTestState(config);
        const blockedCol = 3;
        const blockedRow = 4;
        state.obstacleGrid.grid[colRowToIndex(blockedCol, blockedRow, state.obstacleGrid.cols)] = 1;
        const open = collectWalkableCells(state);
        assert.ok(open.length > 0);
        assert.ok(!open.includes(colRowToIndex(blockedCol, blockedRow, state.obstacleGrid.cols)));
        terminateWorkerNavigation(state.nav);
    });
    it("collectNavWalkableCells skips blocked voxels", async () => {
        const config = createDefaultMapGenBoundsConfig();
        config.boundsCol = 0;
        config.boundsRow = 0;
        config.boundsCols = 8;
        config.boundsRows = 8;
        const state = await createWalkableCellsTestState(config);
        state.obstacleGrid.grid[colRowToIndex(3, 3, state.obstacleGrid.cols)] = 1;
        collectNavWalkableCells(state);
        assert.ok(!isNavWalkableCellAt(state, colRowToIndex(3, 3, state.obstacleGrid.cols)));
        terminateWorkerNavigation(state.nav);
    });
    it("collectNavWalkableCells rebakes when navigation epoch changes", async () => {
        const config = createDefaultMapGenBoundsConfig();
        config.boundsCol = 0;
        config.boundsRow = 0;
        config.boundsCols = 8;
        config.boundsRows = 8;
        const state = await createWalkableCellsTestState(config);
        collectNavWalkableCells(state);
        const before = getNavWalkableCells(state).length;
        state.obstacleGrid.grid[colRowToIndex(2, 2, state.obstacleGrid.cols)] = 1;
        bumpGridNavEpoch(state.obstacleGrid, GRID_NAV_EPOCH.Wall);
        await state.nav.commitEdit({ startCol: 2, endCol: 2, startRow: 2, endRow: 2 });
        collectNavWalkableCells(state);
        assert.ok(getNavWalkableCells(state).length <= before);
        assert.ok(!isNavWalkableCellAt(state, colRowToIndex(2, 2, state.obstacleGrid.cols)));
        terminateWorkerNavigation(state.nav);
    });
    it("stores nav-walkable cells in a dense flag grid", async () => {
        const config = createDefaultMapGenBoundsConfig();
        config.boundsCol = 0;
        config.boundsRow = 0;
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
        config.boundsCol = 0;
        config.boundsRow = 0;
        config.boundsCols = 8;
        config.boundsRows = 8;
        const state = await createWalkableCellsTestState(config);
        state.nav.setNavWalkableSyncHook((damageBounds) => patchNavWalkableCellIndex(state, damageBounds));
        collectNavWalkableCells(state);
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
        config.boundsCol = 0;
        config.boundsRow = 0;
        config.boundsCols = 8;
        config.boundsRows = 8;
        const state = await createWalkableCellsTestState(config);
        collectNavWalkableCells(state);
        const picked = pickNavWalkableCell(state, () => 0);
        assert.ok(picked !== null && picked !== undefined);
        assert.ok(isNavWalkableCellAt(state, picked));
        assert.ok(isNavWalkableCell(state.obstacleGrid, state.nav.topology, picked));
        terminateWorkerNavigation(state.nav);
    });
    it("createNavWalkableAccess binds state and bounds for pick/has/rebake", async () => {
        const config = createDefaultMapGenBoundsConfig();
        config.boundsCol = 0;
        config.boundsRow = 0;
        config.boundsCols = 8;
        config.boundsRows = 8;
        const state = await createWalkableCellsTestState(config);
        const access = createNavWalkableAccess(state, config);
        access.rebake();
        const picked = access.pick(() => 0);
        assert.ok(picked !== null && picked !== undefined);
        assert.ok(access.has(picked));
        terminateWorkerNavigation(state.nav);
    });
    it("pickWalkableCell respects exclude indices", () => {
        const cells = [
            colRowToIndex(1, 1, 8),
            colRowToIndex(2, 2, 8),
            colRowToIndex(3, 3, 8),
        ];
        const excludeIndices = new Set([colRowToIndex(2, 2, 8)]);
        const picked = pickWalkableCell(cells, 8, excludeIndices, () => 0.9);
        assert.equal(picked, colRowToIndex(3, 3, 8));
    });
    it("pickRandomWalkableCell returns null when every cell is excluded", async () => {
        const config = createDefaultMapGenBoundsConfig();
        config.boundsCol = 0;
        config.boundsRow = 0;
        config.boundsCols = 4;
        config.boundsRows = 4;
        const state = await createWalkableCellsTestState(config);
        const open = collectWalkableCells(state);
        const excludeIndices = new Set(open);
        assert.equal(pickRandomWalkableCell(state, config, excludeIndices), null);
        terminateWorkerNavigation(state.nav);
    });
});
