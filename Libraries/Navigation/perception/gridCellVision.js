import { cellInRect, colRowToIndex } from "../../Spatial/grid/GridUtils.js";
import { boundaryBlocksStepFrom } from "../../Spatial/grid/boundaryOccupancy.js";
import { navCanStep } from "../../Pathfinding/navTopologySab.js";
const HEADING_SPEED_MIN = 0.25;
export function resolveObserverHeading(prop) {
    const vx = prop.vx ?? 0;
    const vy = prop.vy ?? 0;
    const speed = Math.hypot(vx, vy);
    if (speed >= HEADING_SPEED_MIN) return Math.atan2(vy, vx);
    return prop.facing ?? 0;
}
export function hasGridCellLineOfSight(navTopology, col0, row0, col1, row1) {
    const grid = navTopology.grid;
    if (!cellInRect(col1, row1, grid.cols, grid.rows)) return false;
    if (col0 === col1 && row0 === row1) return true;
    const cardinalOpen = navTopology.navCardinalOpen;
    const vertexPassability = navTopology.vertexPassability;
    if (cardinalOpen && vertexPassability) {
        let x = col0;
        let y = row0;
        const dx = Math.abs(col1 - col0);
        const dy = Math.abs(row1 - row0);
        const sx = col0 < col1 ? 1 : -1;
        const sy = row0 < row1 ? 1 : -1;
        let err = dx - dy;
        while (true) {
            if (x === col1 && y === row1) return true;
            const e2 = 2 * err;
            let nx = x;
            let ny = y;
            if (e2 > -dy) {
                err -= dy;
                nx = x + sx;
            }
            if (e2 < dx) {
                err += dx;
                ny = y + sy;
            }
            if (!cellInRect(nx, ny, grid.cols, grid.rows)) return false;
            if (boundaryBlocksStepFrom(grid, cardinalOpen, vertexPassability, x, y, nx, ny)) return false;
            x = nx;
            y = ny;
        }
    }
    const frame = navTopology.frame;
    const topology = navTopology.topology;
    if (frame && topology) {
        let x = col0;
        let y = row0;
        const dx = Math.abs(col1 - col0);
        const dy = Math.abs(row1 - row0);
        const sx = col0 < col1 ? 1 : -1;
        const sy = row0 < row1 ? 1 : -1;
        let err = dx - dy;
        while (true) {
            if (x === col1 && y === row1) return true;
            const e2 = 2 * err;
            let nx = x;
            let ny = y;
            if (e2 > -dy) {
                err -= dy;
                nx = x + sx;
            }
            if (e2 < dx) {
                err += dx;
                ny = y + sy;
            }
            if (!cellInRect(nx, ny, grid.cols, grid.rows)) return false;
            if (!navCanStep(frame, topology, x, y, nx, ny)) return false;
            x = nx;
            y = ny;
        }
    }
    return false;
}
export function buildVisionCellSet(cells, cols) {
    const set = new Set();
    for (let i = 0; i < cells.length; i++) {
        const cell = cells[i];
        set.add(colRowToIndex(cell.col, cell.row, cols));
    }
    return set;
}
export function collectVisibleGridCells(navTopology, originX, originY, range) {
    const grid = navTopology.grid;
    const originCol = grid.worldCol(originX);
    const originRow = grid.worldRow(originY);
    const rangeCells = Math.ceil(range / grid.cellSize);
    const rangeSq = range * range;
    const minCol = Math.max(0, originCol - rangeCells);
    const maxCol = Math.min(grid.cols - 1, originCol + rangeCells);
    const minRow = Math.max(0, originRow - rangeCells);
    const maxRow = Math.min(grid.rows - 1, originRow + rangeCells);
    const cells = [];
    for (let row = minRow; row <= maxRow; row++)
        for (let col = minCol; col <= maxCol; col++) {
            const x = grid.gridCenterX(col);
            const y = grid.gridCenterY(row);
            const dx = x - originX;
            const dy = y - originY;
            if (dx * dx + dy * dy > rangeSq) continue;
            if (!hasGridCellLineOfSight(navTopology, originCol, originRow, col, row)) continue;
            cells.push({ col, row });
        }
    return cells;
}
