import { Segment } from "../../Entities/Wall.js";
import { snapLayoutOrigin } from "../../Generator/GridLayout.js";
import { TABLE_COLS, TABLE_ROWS, TABLE_RAIL_CELLS } from "./config/tableLayout.js";

function carveRect(grid, cols, rows, x, y, w, h) {
    for (let r = y; r < y + h && r < rows; r++) {
        if (r < 0) continue;
        for (let c = x; c < x + w && c < cols; c++) {
            if (c < 0) continue;
            grid[r * cols + c] = 0;
        }
    }
}

/**
 * Rectangular pool table: filled rail ring around open playfield.
 * Pockets are sensor-only (walls stay continuous).
 */
export function generatePoolTable(state, px, py) {
    const cellSize = state.flowFieldGrid.cellSize;
    const cols = TABLE_COLS;
    const rows = TABLE_ROWS;
    const grid = new Uint8Array(cols * rows).fill(1);
    const rail = TABLE_RAIL_CELLS;

    carveRect(grid, cols, rows, rail, rail, cols - rail * 2, rows - rail * 2);

    const { offsetX, offsetY } = snapLayoutOrigin(px, py, cols, rows, cellSize);
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            if (grid[r * cols + c] !== 1) continue;
            state.walls.push(new Segment(
                offsetX + c * cellSize + cellSize / 2,
                offsetY + r * cellSize + cellSize / 2,
                0,
                cellSize,
                0,
                30,
                30,
                false,
                20,
            ));
        }
    }
}

export const PoolTableStrategy = {
    generate(state, px, py) {
        generatePoolTable(state, px, py);
    },
};
