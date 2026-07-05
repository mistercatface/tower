import "./nodeCanvasSetup.js";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createDefaultMapGenBoundsConfig } from "../Libraries/Spatial/spatial.js";
import { collectWalkableCells, collectNavWalkableCells, createNavWalkableAccess, getNavWalkableCellIndex, getNavWalkableCells, isNavWalkableCellAt, patchNavWalkableCellIndex, pickWalkableCell, pickNavWalkableCell, pickRandomWalkableCell, isNavWalkableAt, isNavWalkableCell } from "../Libraries/Procedural/Mazes/walkableCells.js";
import { createWorkerNavigation, terminateWorkerNavigation } from "./WorkerNavigationFactory.js";
import {  WorldObstacleGrid  } from "../Libraries/Spatial/spatial.js";
import { worldIdxAtCell } from "./harness/testGridUtils.js";
import {  GRID_NAV_EPOCH, bumpGridNavEpoch, gridNavCacheKey  } from "../Libraries/Spatial/spatial.js";
async function createWalkableCellsTestState(config) {
    const grid = new WorldObstacleGrid(16);
    grid.rebuildFixed(0, 0, config.boundsCols * 16, config.boundsRows * 16);
    const navigation = await createWorkerNavigation(grid);
    return { obstacleGrid: grid, editor: { cavernConfig: config }, sandbox: {}, nav: navigation };
}
describe("walkableCells", () => {
    it("collectWalkableCells skips blocked grid cells inside bounds", async () => {
        const config = createDefaultMapGenBoundsConfig();
        config.boundsIdx = 0;
        config.boundsCols = 8;
        config.boundsRows = 8;
        const state = await createWalkableCellsTestState(config);
        const blockedCol = 3;
        const blockedRow = 4;
        state.obstacleGrid.grid[worldIdxAtCell(state.obstacleGrid,blockedCol, blockedRow)] = 1;
        const open = collectWalkableCells(state);
        assert.ok(open.length > 0);
        assert.ok(!open.includes(worldIdxAtCell(state.obstacleGrid,blockedCol, blockedRow)));
        terminateWorkerNavigation(state.nav);
    });
    it("collectNavWalkableCells skips blocked voxels", async () => {
        const config = createDefaultMapGenBoundsConfig();
        config.boundsIdx = 0;
        config.boundsCols = 8;
        config.boundsRows = 8;
        const state = await createWalkableCellsTestState(config);
        state.obstacleGrid.grid[worldIdxAtCell(state.obstacleGrid,3, 3)] = 1;
        collectNavWalkableCells(state);
        assert.ok(!isNavWalkableCellAt(state, worldIdxAtCell(state.obstacleGrid,3, 3)));
        terminateWorkerNavigation(state.nav);
    });
    it("collectNavWalkableCells rebakes when navigation epoch changes", async () => {
        const config = createDefaultMapGenBoundsConfig();
        config.boundsIdx = 0;
        config.boundsCols = 8;
        config.boundsRows = 8;
        const state = await createWalkableCellsTestState(config);
        collectNavWalkableCells(state);
        const before = getNavWalkableCells(state).length;
        state.obstacleGrid.grid[worldIdxAtCell(state.obstacleGrid,2, 2)] = 1;
        bumpGridNavEpoch(state.obstacleGrid, GRID_NAV_EPOCH.Wall);
        await state.nav.commitEdit({ startCol: 2, endCol: 2, startRow: 2, endRow: 2 });
        collectNavWalkableCells(state);
        assert.ok(getNavWalkableCells(state).length <= before);
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
        config.boundsIdx = 0;
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
        config.boundsIdx = 0;
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
    it("pickRandomWalkableCell returns null when every cell is excluded", async () => {
        const config = createDefaultMapGenBoundsConfig();
        config.boundsIdx = 0;
        config.boundsCols = 4;
        config.boundsRows = 4;
        const state = await createWalkableCellsTestState(config);
        const open = collectWalkableCells(state);
        const excludeIndices = new Set(open);
        assert.equal(pickRandomWalkableCell(state, config, excludeIndices), null);
        terminateWorkerNavigation(state.nav);
    });
});
