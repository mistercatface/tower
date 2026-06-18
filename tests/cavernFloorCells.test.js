import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createDefaultMapGenBoundsConfig } from "../Libraries/Sandbox/mapGenBounds.js";
import { cavernCellKey, collectOpenCavernCells, pickOpenCavernCell, pickRandomOpenCavernCell } from "../Libraries/Sandbox/cavernFloorCells.js";
import { WorldObstacleGrid } from "../Libraries/Spatial/grid/WorldObstacleGrid.js";
import { colRowToIndex } from "../Libraries/Spatial/grid/GridUtils.js";
function createCavernFloorTestState(config) {
    const grid = new WorldObstacleGrid(16);
    grid.rebuildFixed(0, 0, config.boundsCols * 16, config.boundsRows * 16);
    return { obstacleGrid: grid, editor: { cavernConfig: config } };
}
describe("cavernFloorCells", () => {
    it("collectOpenCavernCells skips blocked grid cells inside bounds", () => {
        const config = createDefaultMapGenBoundsConfig();
        config.boundsCol = 0;
        config.boundsRow = 0;
        config.boundsCols = 8;
        config.boundsRows = 8;
        const state = createCavernFloorTestState(config);
        const blockedCol = 3;
        const blockedRow = 4;
        state.obstacleGrid.grid[colRowToIndex(blockedCol, blockedRow, state.obstacleGrid.cols)] = 1;
        const open = collectOpenCavernCells(state);
        assert.ok(open.length > 0);
        assert.ok(!open.some((cell) => cell.col === blockedCol && cell.row === blockedRow));
    });
    it("pickOpenCavernCell respects exclude keys", () => {
        const cells = [
            { col: 1, row: 1 },
            { col: 2, row: 2 },
            { col: 3, row: 3 },
        ];
        const excludeKeys = new Set([cavernCellKey(2, 2)]);
        const picked = pickOpenCavernCell(cells, { excludeKeys, rng: () => 0.99 });
        assert.equal(picked.col, 3);
        assert.equal(picked.row, 3);
    });
    it("pickRandomOpenCavernCell returns null when every cell is excluded", () => {
        const config = createDefaultMapGenBoundsConfig();
        config.boundsCol = 0;
        config.boundsRow = 0;
        config.boundsCols = 4;
        config.boundsRows = 4;
        const state = createCavernFloorTestState(config);
        const open = collectOpenCavernCells(state);
        const excludeKeys = new Set(open.map((cell) => cavernCellKey(cell.col, cell.row)));
        assert.equal(pickRandomOpenCavernCell(state, { excludeKeys }), null);
    });
});
