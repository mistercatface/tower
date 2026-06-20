import { cellInRect } from "../../Spatial/grid/GridUtils.js";
import { createNavGraphViewFromContext } from "../navGraph.js";
import { gridCellLosCacheKey } from "./gridCellVisionSession.js";
const HEADING_SPEED_MIN = 0.25;
const HEADING_CACHE_BUCKETS = 32;
export function resolveObserverHeading(prop) {
    const vx = prop.vx ?? 0;
    const vy = prop.vy ?? 0;
    const speed = Math.hypot(vx, vy);
    if (speed >= HEADING_SPEED_MIN) return Math.atan2(vy, vx);
    return prop.facing ?? 0;
}
export function bucketObserverHeading(heading) {
    return Math.round(heading * HEADING_CACHE_BUCKETS) / HEADING_CACHE_BUCKETS;
}
export function normalizeAngleDelta(delta) {
    let d = delta;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return d;
}
export function isWorldPointInVisionCone(originX, originY, heading, halfAngle, range, pointX, pointY) {
    const dx = pointX - originX;
    const dy = pointY - originY;
    const distSq = dx * dx + dy * dy;
    if (distSq > range * range) return false;
    if (distSq < 1e-8) return true;
    const angle = Math.atan2(dy, dx);
    return Math.abs(normalizeAngleDelta(angle - heading)) <= halfAngle;
}
export function hasGridCellLineOfSight(gridNavContext, col0, row0, col1, row1) {
    const grid = gridNavContext.grid;
    const graph = createNavGraphViewFromContext(gridNavContext);
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
export function hasGridCellLineOfSightCached(visionSession, gridNavContext, col0, row0, col1, row1) {
    if (!visionSession) return hasGridCellLineOfSight(gridNavContext, col0, row0, col1, row1);
    const key = gridCellLosCacheKey(col0, row0, col1, row1);
    if (visionSession.losCache.has(key)) return visionSession.losCache.get(key);
    const visible = hasGridCellLineOfSight(gridNavContext, col0, row0, col1, row1);
    visionSession.losCache.set(key, visible);
    return visible;
}
export function collectVisibleGridCells(gridNavContext, originX, originY, heading, halfAngle, range, visionSession = null) {
    const grid = gridNavContext.grid;
    const { col: originCol, row: originRow } = grid.worldToGrid(originX, originY);
    const rangeCells = Math.ceil(range / grid.cellSize);
    const rangeSq = range * range;
    const minCol = Math.max(0, originCol - rangeCells);
    const maxCol = Math.min(grid.cols - 1, originCol + rangeCells);
    const minRow = Math.max(0, originRow - rangeCells);
    const maxRow = Math.min(grid.rows - 1, originRow + rangeCells);
    const cells = [];
    for (let row = minRow; row <= maxRow; row++)
        for (let col = minCol; col <= maxCol; col++) {
            const { x, y } = grid.gridToWorld(col, row);
            const dx = x - originX;
            const dy = y - originY;
            if (dx * dx + dy * dy > rangeSq) continue;
            if (!isWorldPointInVisionCone(originX, originY, heading, halfAngle, range, x, y)) continue;
            if (!hasGridCellLineOfSightCached(visionSession, gridNavContext, originCol, originRow, col, row)) continue;
            cells.push({ col, row });
        }
    return cells;
}
