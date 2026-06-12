import { forEachDenseCellInRect } from "../../DataStructures/CellRect.js";
import { colRowToIndex } from "./GridUtils.js";
import { pointToSegmentPaddingDistanceSq, getWallReach } from "../geometry/WallGeometry.js";
import { spatialWorldMargin } from "../../../Config/Config.js";
function isGridTileWall(wall, cellSize) {
    return Math.abs(wall.angle) < 1e-6 && (wall.padding ?? 0) === 0 && wall.size === cellSize;
}
/** @returns {{ startCol: number, endCol: number, startRow: number, endRow: number }} Same cell indices as boundsToCellRect minCol/maxCol. */
export function getWallCellBounds(wall, worldToGrid, cols, rows, padding = wall.padding) {
    const reach = getWallReach(wall, padding);
    const minGrid = worldToGrid(wall.x - reach, wall.y - reach);
    const maxGrid = worldToGrid(wall.x + reach, wall.y + reach);
    return { startCol: Math.max(0, minGrid.col), endCol: Math.min(cols - 1, maxGrid.col), startRow: Math.max(0, minGrid.row), endRow: Math.min(rows - 1, maxGrid.row) };
}
/** @param {{ startCol: number, endCol: number, startRow: number, endRow: number } | null} a @param {{ startCol: number, endCol: number, startRow: number, endRow: number }} b */
export function unionGridCellRect(a, b) {
    if (!a) return b;
    return { startCol: Math.min(a.startCol, b.startCol), endCol: Math.max(a.endCol, b.endCol), startRow: Math.min(a.startRow, b.startRow), endRow: Math.max(a.endRow, b.endRow) };
}
export function markWallOnGrid(wall, grid, cols, rows, { worldToGrid, cellCenter, cellSize, padding = wall.padding, onBlockedCell }) {
    if (wall.isDead) return;
    if (cellSize && isGridTileWall(wall, cellSize)) {
        const half = wall.size / 2;
        const { col, row } = worldToGrid(wall.x - half, wall.y - half);
        if (col >= 0 && col < cols && row >= 0 && row < rows) {
            const idx = colRowToIndex(col, row, cols);
            grid[idx] = 1;
            if (onBlockedCell) onBlockedCell(col, row, idx);
        }
        return;
    }
    const bounds = getWallCellBounds(wall, worldToGrid, cols, rows, padding);
    const paddingSq = padding * padding + 0.01;
    forEachDenseCellInRect(bounds.startCol, bounds.endCol, bounds.startRow, bounds.endRow, cols, (col, row, idx) => {
        const { x: cx, y: cy } = cellCenter(col, row);
        if (pointToSegmentPaddingDistanceSq(wall, cx, cy) <= paddingSq) {
            grid[idx] = 1;
            if (onBlockedCell) onBlockedCell(col, row, idx);
        }
    });
}
export function clearWallCells(grid, cols, bounds, segmentGrid = null) {
    forEachDenseCellInRect(bounds.startCol, bounds.endCol, bounds.startRow, bounds.endRow, cols, (_col, _row, idx) => {
        grid[idx] = 0;
        if (segmentGrid && segmentGrid[idx]) segmentGrid[idx].length = 0;
    });
}
export function computeBoundsFromWalls(walls, cellSize) {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    let latticeMinX = Infinity;
    let latticeMaxX = -Infinity;
    let latticeMinY = Infinity;
    let latticeMaxY = -Infinity;
    for (const wall of walls) {
        const half = wall.size / 2;
        const reach = half + wall.padding;
        minX = Math.min(minX, wall.x - reach);
        maxX = Math.max(maxX, wall.x + reach);
        minY = Math.min(minY, wall.y - reach);
        maxY = Math.max(maxY, wall.y + reach);
        if (isGridTileWall(wall, cellSize)) {
            const left = wall.x - half;
            const top = wall.y - half;
            latticeMinX = Math.min(latticeMinX, left);
            latticeMaxX = Math.max(latticeMaxX, left + wall.size);
            latticeMinY = Math.min(latticeMinY, top);
            latticeMaxY = Math.max(latticeMaxY, top + wall.size);
        }
    }
    if (minX === Infinity) {
        minX = -2000;
        maxX = 2000;
        minY = -2000;
        maxY = 2000;
    } else {
        const marginCells = Math.ceil(spatialWorldMargin / cellSize);
        const margin = marginCells * cellSize;
        if (latticeMinX !== Infinity) {
            minX = latticeMinX - margin;
            maxX = latticeMaxX + margin;
            minY = latticeMinY - margin;
            maxY = latticeMaxY + margin;
            const phaseX = (((latticeMinX - minX) % cellSize) + cellSize) % cellSize;
            if (phaseX !== 0) {
                minX += phaseX;
                maxX += phaseX;
            }
            const phaseY = (((latticeMinY - minY) % cellSize) + cellSize) % cellSize;
            if (phaseY !== 0) {
                minY += phaseY;
                maxY += phaseY;
            }
        } else {
            minX -= margin;
            maxX += margin;
            minY -= margin;
            maxY += margin;
            minX = Math.floor(minX / cellSize) * cellSize;
            minY = Math.floor(minY / cellSize) * cellSize;
            maxX = Math.ceil(maxX / cellSize) * cellSize;
            maxY = Math.ceil(maxY / cellSize) * cellSize;
        }
    }
    return { minX, maxX, minY, maxY };
}
