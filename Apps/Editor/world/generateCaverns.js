import { Segment } from "../../../Entities/Wall.js";
import { gridSettings } from "../../../Config/Config.js";
/**
 * Cellular-automata cave walls in a world-axis rectangle. No node clear zones.
 *
 * @param {number} centerX
 * @param {number} centerY
 * @param {{ halfWidth: number, halfHeight: number, fillChance: number, iterations: number }} config
 * @returns {import("../../../Entities/Wall.js").Segment[]}
 */
export function generateCavernWalls(centerX, centerY, { halfWidth, halfHeight, fillChance, iterations }) {
    const cellSize = gridSettings.cellSize;
    const minX = centerX - halfWidth;
    const minY = centerY - halfHeight;
    const maxX = centerX + halfWidth;
    const maxY = centerY + halfHeight;
    const caMinX = Math.floor(minX / cellSize) * cellSize;
    const caMinY = Math.floor(minY / cellSize) * cellSize;
    const caMaxX = Math.ceil(maxX / cellSize) * cellSize;
    const caMaxY = Math.ceil(maxY / cellSize) * cellSize;
    const cols = (caMaxX - caMinX) / cellSize;
    const rows = (caMaxY - caMinY) / cellSize;
    let grid = new Uint8Array(cols * rows);
    for (let i = 0; i < grid.length; i++) if (Math.random() < fillChance) grid[i] = 1;
    let nextGrid = new Uint8Array(cols * rows);
    for (let iter = 0; iter < iterations; iter++) {
        for (let r = 0; r < rows; r++)
            for (let c = 0; c < cols; c++) {
                let wallsCount = 0;
                for (let dr = -1; dr <= 1; dr++)
                    for (let dc = -1; dc <= 1; dc++) {
                        const nr = r + dr;
                        const nc = c + dc;
                        if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
                            if (grid[nr * cols + nc] === 1) wallsCount++;
                        } else wallsCount++;
                    }
                nextGrid[r * cols + c] = wallsCount >= 5 ? 1 : 0;
            }
        const temp = grid;
        grid = nextGrid;
        nextGrid = temp;
    }
    const walls = [];
    for (let r = 0; r < rows; r++)
        for (let c = 0; c < cols; c++) {
            if (grid[r * cols + c] !== 1) continue;
            const wx = caMinX + c * cellSize + cellSize / 2;
            const wy = caMinY + r * cellSize + cellSize / 2;
            walls.push(new Segment(wx, wy, 0, cellSize, 0));
        }
    return walls;
}
