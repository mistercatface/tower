import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createDefaultMapGenBoundsConfig } from "../Libraries/Sandbox/mapGenBounds.js";
import {
    walkableCellKey,
    collectWalkableCells,
    collectNavWalkableCells,
    createNavWalkableAccess,
    getNavWalkableCells,
    isNavWalkableCellAt,
    pickWalkableCell,
    pickNavWalkableCell,
    pickRandomWalkableCell,
} from "../Libraries/Procedural/Mazes/walkableCells.js";
import { isNavWalkableCell } from "../Libraries/Spatial/grid/navWalkableCell.js";
import { WorldObstacleGrid } from "../Libraries/Spatial/grid/WorldObstacleGrid.js";
import { colRowToIndex } from "../Libraries/Spatial/grid/GridUtils.js";

function createWalkableCellsTestState(config) {
    const grid = new WorldObstacleGrid(16);
    grid.rebuildFixed(0, 0, config.boundsCols * 16, config.boundsRows * 16);
    return { obstacleGrid: grid, editor: { cavernConfig: config }, sandbox: {}, navigation: { obstacleGeneration: 0 } };
}

describe("walkableCells", () => {
    it("collectWalkableCells skips blocked grid cells inside bounds", () => {
        const config = createDefaultMapGenBoundsConfig();
        config.boundsCol = 0;
        config.boundsRow = 0;
        config.boundsCols = 8;
        config.boundsRows = 8;
        const state = createWalkableCellsTestState(config);
        const blockedCol = 3;
        const blockedRow = 4;
        state.obstacleGrid.grid[colRowToIndex(blockedCol, blockedRow, state.obstacleGrid.cols)] = 1;
        const open = collectWalkableCells(state);
        assert.ok(open.length > 0);
        assert.ok(!open.some((cell) => cell.col === blockedCol && cell.row === blockedRow));
    });

    it("collectNavWalkableCells skips blocked voxels", () => {
        const config = createDefaultMapGenBoundsConfig();
        config.boundsCol = 0;
        config.boundsRow = 0;
        config.boundsCols = 8;
        config.boundsRows = 8;
        const state = createWalkableCellsTestState(config);
        state.obstacleGrid.grid[colRowToIndex(3, 3, state.obstacleGrid.cols)] = 1;
        collectNavWalkableCells(state);
        assert.ok(!isNavWalkableCellAt(state, 3, 3));
    });

    it("collectNavWalkableCells rebakes when navigation epoch changes", () => {
        const config = createDefaultMapGenBoundsConfig();
        config.boundsCol = 0;
        config.boundsRow = 0;
        config.boundsCols = 8;
        config.boundsRows = 8;
        const state = createWalkableCellsTestState(config);
        collectNavWalkableCells(state);
        const before = getNavWalkableCells(state).length;
        state.navigation.obstacleGeneration = 1;
        state.obstacleGrid.grid[colRowToIndex(2, 2, state.obstacleGrid.cols)] = 1;
        collectNavWalkableCells(state);
        assert.ok(getNavWalkableCells(state).length <= before);
        assert.ok(!isNavWalkableCellAt(state, 2, 2));
    });

    it("pickNavWalkableCell only returns baked nav-walkable cells", () => {
        const config = createDefaultMapGenBoundsConfig();
        config.boundsCol = 0;
        config.boundsRow = 0;
        config.boundsCols = 8;
        config.boundsRows = 8;
        const state = createWalkableCellsTestState(config);
        collectNavWalkableCells(state);
        const picked = pickNavWalkableCell(state, { rng: () => 0 });
        assert.ok(picked);
        assert.ok(isNavWalkableCellAt(state, picked.col, picked.row));
        assert.ok(isNavWalkableCell(state.obstacleGrid, picked.col, picked.row));
    });

    it("createNavWalkableAccess binds state and bounds for pick/has/rebake", () => {
        const config = createDefaultMapGenBoundsConfig();
        config.boundsCol = 0;
        config.boundsRow = 0;
        config.boundsCols = 8;
        config.boundsRows = 8;
        const state = createWalkableCellsTestState(config);
        const access = createNavWalkableAccess(state, config);
        access.rebake();
        const picked = access.pick({ rng: () => 0 });
        assert.ok(picked);
        assert.ok(access.has(picked.col, picked.row));
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

    it("pickRandomWalkableCell returns null when every cell is excluded", () => {
        const config = createDefaultMapGenBoundsConfig();
        config.boundsCol = 0;
        config.boundsRow = 0;
        config.boundsCols = 4;
        config.boundsRows = 4;
        const state = createWalkableCellsTestState(config);
        const open = collectWalkableCells(state);
        const excludeKeys = new Set(open.map((cell) => walkableCellKey(cell.col, cell.row)));
        assert.equal(pickRandomWalkableCell(state, { excludeKeys }), null);
    });
});
