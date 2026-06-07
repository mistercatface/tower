import { Segment } from "../../Entities/Wall.js";
import { snapLayoutOrigin } from "../../Generator/GridLayout.js";
import { getGameWorldSurfaceSettings } from "../../Render/WorldSurfaceBootstrap.js";
import { getWallHeight } from "../../Libraries/WorldSurface/WorldSurfaceSettings.js";
import { TABLE_COLS, TABLE_ROWS, TABLE_RAIL_CELLS, getPocketPositions, getPocketArcAngles } from "./config/tableLayout.js";

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
 * Cushion rails have carved cutouts and circular 3D wall segments generated at pockets.
 */
export function generatePoolTable(state, px, py) {
    const cellSize = state.flowFieldGrid.cellSize;
    const cols = TABLE_COLS;
    const rows = TABLE_ROWS;
    const grid = new Uint8Array(cols * rows).fill(1);
    const rail = TABLE_RAIL_CELLS;
    carveRect(grid, cols, rows, rail, rail, cols - rail * 2, rows - rail * 2);

    const { offsetX, offsetY } = snapLayoutOrigin(px, py, cols, rows, cellSize);
    const railHeight = getWallHeight(getGameWorldSurfaceSettings());
    const pockets = getPocketPositions(offsetX, offsetY, cellSize);

    // Carve out cells within pocket.radius + 6 (20 units) of any pocket center
    const carveRadius = 20;
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            if (grid[r * cols + c] !== 1) continue;
            const cx = offsetX + c * cellSize + cellSize / 2;
            const cy = offsetY + r * cellSize + cellSize / 2;

            let nearPocket = false;
            for (const pocket of pockets) {
                const dx = cx - pocket.x;
                const dy = cy - pocket.y;
                if (dx * dx + dy * dy < carveRadius * carveRadius) {
                    nearPocket = true;
                    break;
                }
            }
            if (nearPocket) {
                grid[r * cols + c] = 0;
            }
        }
    }

    // Generate straight rail segments
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            if (grid[r * cols + c] !== 1) continue;
            state.walls.push(new Segment(offsetX + c * cellSize + cellSize / 2, offsetY + r * cellSize + cellSize / 2, 0, cellSize, 0, 30, 30, false, railHeight));
        }
    }

    // Build curved wall segments around the back of each pocket in 3D
    for (const pocket of pockets) {
        const { start, end } = getPocketArcAngles(pocket.kind);
        const backStart = end;
        const backEnd = start + 2 * Math.PI;

        const radius = pocket.radius;
        const arcLength = radius * Math.abs(backEnd - backStart);
        const size = 6; // Small segments for a smooth circle
        const numSegments = Math.max(1, Math.ceil(arcLength / (size * 1.1)));
        const angleStep = (backEnd - backStart) / numSegments;

        for (let i = 0; i < numSegments; i++) {
            const angle = backStart + i * angleStep + angleStep / 2;
            const sx = pocket.x + Math.cos(angle) * radius;
            const sy = pocket.y + Math.sin(angle) * radius;
            // The segment is tangent to the circle
            const segAngle = angle + Math.PI / 2;
            state.walls.push(new Segment(sx, sy, segAngle, size, 0, 30, 30, false, railHeight));
        }
    }
}

export const PoolTableStrategy = {
    generate(state, px, py) {
        generatePoolTable(state, px, py);
    },
};
