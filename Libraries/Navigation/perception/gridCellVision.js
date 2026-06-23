import { cellInRect, colRowToIndex } from "../../Spatial/grid/GridUtils.js";
import { createNavGraphViewFromTopology } from "../navGraph.js";
import { gridCellLosCacheKey } from "./gridCellVisionSession.js";
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
    const graph = createNavGraphViewFromTopology(navTopology);
    if (!cellInRect(col1, row1, grid.cols, grid.rows)) return false;
    if (col0 === col1 && row0 === row1) return true;
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
        if (!graph.canStep(x, y, nx, ny)) return false;
        x = nx;
        y = ny;
    }
}
export function hasGridCellLineOfSightCached(visionSession, navTopology, col0, row0, col1, row1) {
    if (!visionSession) return hasGridCellLineOfSight(navTopology, col0, row0, col1, row1);
    const key = gridCellLosCacheKey(col0, row0, col1, row1);
    if (visionSession.losCache.has(key)) return visionSession.losCache.get(key);
    const visible = hasGridCellLineOfSight(navTopology, col0, row0, col1, row1);
    visionSession.losCache.set(key, visible);
    return visible;
}
export function buildVisionCellSet(cells, cols) {
    const set = new Set();
    for (let i = 0; i < cells.length; i++) {
        const cell = cells[i];
        set.add(colRowToIndex(cell.col, cell.row, cols));
    }
    return set;
}
export function isPointVisibleFromHeadVision(pointX, pointY, originX, originY, originCol, originRow, range, cellSet, navTopology, visionSession = null) {
    const grid = navTopology.grid;
    const col = grid.worldCol(pointX);
    const row = grid.worldRow(pointY);
    if (cellSet.has(colRowToIndex(col, row, grid.cols))) return true;
    const dx = pointX - originX;
    const dy = pointY - originY;
    if (dx * dx + dy * dy > range * range) return false;
    return hasGridCellLineOfSightCached(visionSession, navTopology, originCol, originRow, col, row);
}
export function collectVisibleGridCells(navTopology, originX, originY, range, visionSession = null) {
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
            if (!hasGridCellLineOfSightCached(visionSession, navTopology, originCol, originRow, col, row)) continue;
            cells.push({ col, row });
        }
    return cells;
}
