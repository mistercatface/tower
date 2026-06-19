import { boundaryBlocksStepFrom } from "../../Spatial/grid/boundaryOccupancy.js";
import { cellInRect } from "../../Spatial/grid/GridUtils.js";
import { recomputeNavCardinalOpen, recomputeVertexPassability } from "../../Spatial/grid/vertexPassability.js";
import { wallContextFromState } from "../../Spatial/query/wallContext.js";

function ensureBoundaryStepCaches(grid) {
    const cellCount = grid.cols * grid.rows;
    if (grid._boundaryStepCacheRevision === grid.wallGridRevision && grid.navCardinalOpen.length === cellCount) return;
    recomputeNavCardinalOpen(grid);
    recomputeVertexPassability(grid);
    grid._boundaryStepCacheRevision = grid.wallGridRevision;
}
const HEADING_SPEED_MIN = 0.25;
export function resolveObserverHeading(prop) {
    const vx = prop.vx ?? 0;
    const vy = prop.vy ?? 0;
    const speed = Math.hypot(vx, vy);
    if (speed >= HEADING_SPEED_MIN) return Math.atan2(vy, vx);
    return prop.facing ?? 0;
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
export function hasGridCellLineOfSight(grid, col0, row0, col1, row1) {
    if (!cellInRect(col1, row1, grid.cols, grid.rows)) return false;
    if (col0 === col1 && row0 === row1) return true;
    ensureBoundaryStepCaches(grid);
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
        if (boundaryBlocksStepFrom(grid, x, y, nx, ny)) return false;
        x = nx;
        y = ny;
    }
}
export function collectVisibleGridCells(grid, originX, originY, heading, halfAngle, range) {
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
            if (!hasGridCellLineOfSight(grid, originCol, originRow, col, row)) continue;
            cells.push({ col, row });
        }
    return cells;
}
export function queryGridCellVision(observer, candidates, { halfAngle, range, wallCtx = null, state = null } = {}) {
    const ctx = wallCtx ?? wallContextFromState(state);
    const grid = ctx?.obstacleGrid;
    const heading = resolveObserverHeading(observer);
    const cells = grid ? collectVisibleGridCells(grid, observer.x, observer.y, heading, halfAngle, range) : [];
    const visible = [];
    if (grid) {
        const { col: originCol, row: originRow } = grid.worldToGrid(observer.x, observer.y);
        for (let i = 0; i < candidates.length; i++) {
            const target = candidates[i];
            if (target === observer || target.isDead) continue;
            if (!isWorldPointInVisionCone(observer.x, observer.y, heading, halfAngle, range, target.x, target.y)) continue;
            const { col, row } = grid.worldToGrid(target.x, target.y);
            if (!hasGridCellLineOfSight(grid, originCol, originRow, col, row)) continue;
            visible.push(target);
        }
    } else
        for (let i = 0; i < candidates.length; i++) {
            const target = candidates[i];
            if (target === observer || target.isDead) continue;
            if (!isWorldPointInVisionCone(observer.x, observer.y, heading, halfAngle, range, target.x, target.y)) continue;
            visible.push(target);
        }
    return { heading, halfAngle, range, cells, visible };
}
export function queryVisionCone(observer, candidates, options = {}) {
    return queryGridCellVision(observer, candidates, options);
}
