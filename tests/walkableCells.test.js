import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createDefaultMapGenBoundsConfig } from "../Libraries/Sandbox/mapGenBounds.js";
import { walkableCellKey, collectWalkableCells, pickWalkableCell, pickRandomWalkableCell } from "../Libraries/Procedural/Mazes/walkableCells.js";
import { WorldObstacleGrid } from "../Libraries/Spatial/grid/WorldObstacleGrid.js";
import { colRowToIndex } from "../Libraries/Spatial/grid/GridUtils.js";

function createWalkableCellsTestState(config) {
    const grid = new WorldObstacleGrid(16);
    grid.rebuildFixed(0, 0, config.boundsCols * 16, config.boundsRows * 16);
    return { obstacleGrid: grid, editor: { cavernConfig: config }, sandbox: {} };
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
