import "./nodeCanvasSetup.js";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createDefaultMapGenBoundsConfig } from "../Libraries/Sandbox/mapGenBounds.js";
import {
    walkableCellKey,
    collectWalkableCells,
    collectNavWalkableCells,
    createNavWalkableAccess,
    getNavWalkableCellIndex,
    getNavWalkableCells,
    isNavWalkableCellAt,
    patchNavWalkableCellIndex,
    pickWalkableCell,
    pickNavWalkableCell,
    pickRandomWalkableCell,
} from "../Libraries/Procedural/Mazes/walkableCells.js";
import { readNavWalkableFlag } from "../Libraries/Procedural/Mazes/navWalkableIndex.js";
import { createWorkerNavigation, terminateWorkerNavigation } from "../Libraries/Navigation/WorkerNavigationFactory.js";
import { isNavWalkableCell } from "../Libraries/Spatial/grid/navWalkableCell.js";
import { WorldObstacleGrid } from "../Libraries/Spatial/grid/WorldObstacleGrid.js";
import { colRowToIndex } from "../Libraries/Spatial/grid/GridUtils.js";
import { GRID_NAV_EPOCH, bumpGridNavEpoch, gridNavCacheKey } from "../Libraries/Spatial/grid/gridNavEpoch.js";
async function createWalkableCellsTestState(config) {
    const grid = new WorldObstacleGrid(16);
    grid.rebuildFixed(0, 0, config.boundsCols * 16, config.boundsRows * 16);
    const navigation = await createWorkerNavigation(grid);
    return { obstacleGrid: grid, editor: { cavernConfig: config }, sandbox: {}, navigation };
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
        assert.ok(!open.some((cell) => cell.col === blockedCol && cell.row === blockedRow));
        terminateWorkerNavigation(state.navigation);
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
        assert.ok(!isNavWalkableCellAt(state, 3, 3));
        terminateWorkerNavigation(state.navigation);
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
        await state.navigation.onObstaclesChanged({ startCol: 2, endCol: 2, startRow: 2, endRow: 2 });
        collectNavWalkableCells(state);
        assert.ok(getNavWalkableCells(state).length <= before);
        assert.ok(!isNavWalkableCellAt(state, 2, 2));
        terminateWorkerNavigation(state.navigation);
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
        const picked = pickNavWalkableCell(state, { rng: () => 0 });
        assert.ok(readNavWalkableFlag(index.flags, index.cols, picked.col, picked.row));
        terminateWorkerNavigation(state.navigation);
    });
    it("patchNavWalkableCellIndex rebakes cached bounds after obstacle epoch bump", async () => {
        const config = createDefaultMapGenBoundsConfig();
        config.boundsCol = 0;
        config.boundsRow = 0;
        config.boundsCols = 8;
        config.boundsRows = 8;
        const state = await createWalkableCellsTestState(config);
        state.navigation.setNavWalkableSyncHook((damageBounds) => patchNavWalkableCellIndex(state, damageBounds));
        collectNavWalkableCells(state);
        const picked = pickNavWalkableCell(state, { rng: () => 0 });
        assert.ok(picked);
        assert.ok(isNavWalkableCellAt(state, picked.col, picked.row));
        state.obstacleGrid.grid[colRowToIndex(picked.col, picked.row, state.obstacleGrid.cols)] = 1;
        await state.navigation.onObstaclesChanged({ startCol: picked.col, endCol: picked.col, startRow: picked.row, endRow: picked.row });
        assert.ok(!isNavWalkableCellAt(state, picked.col, picked.row));
        terminateWorkerNavigation(state.navigation);
    });
    it("pickNavWalkableCell only returns baked nav-walkable cells", async () => {
        const config = createDefaultMapGenBoundsConfig();
        config.boundsCol = 0;
        config.boundsRow = 0;
        config.boundsCols = 8;
        config.boundsRows = 8;
        const state = await createWalkableCellsTestState(config);
        collectNavWalkableCells(state);
        const picked = pickNavWalkableCell(state, { rng: () => 0 });
        assert.ok(picked);
        assert.ok(isNavWalkableCellAt(state, picked.col, picked.row));
        assert.ok(isNavWalkableCell(state.obstacleGrid, state.navigation.gridNavContext, picked.col, picked.row));
        terminateWorkerNavigation(state.navigation);
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
        const picked = access.pick({ rng: () => 0 });
        assert.ok(picked);
        assert.ok(access.has(picked.col, picked.row));
        terminateWorkerNavigation(state.navigation);
    });
    it("pickWalkableCell respects exclude keys", () => {
        const cells = [
            { col: 1, row: 1 },
            { col: 2, row: 2 },
            { col: 3, row: 3 },
        ];
        const excludeKeys = new Set([walkableCellKey(2, 2)]);
        const picked = pickWalkableCell(cells, { excludeKeys, rng: () => 0.99 });
        assert.equal(picked.col, 3);
        assert.equal(picked.row, 3);
    });
    it("pickRandomWalkableCell returns null when every cell is excluded", async () => {
        const config = createDefaultMapGenBoundsConfig();
        config.boundsCol = 0;
        config.boundsRow = 0;
        config.boundsCols = 4;
        config.boundsRows = 4;
        const state = await createWalkableCellsTestState(config);
        const open = collectWalkableCells(state);
        const excludeKeys = new Set(open.map((cell) => walkableCellKey(cell.col, cell.row)));
        assert.equal(pickRandomWalkableCell(state, { excludeKeys }), null);
        terminateWorkerNavigation(state.navigation);
    });
});
