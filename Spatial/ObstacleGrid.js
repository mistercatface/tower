import { colRowToIndex } from "./GridUtils.js";

export function getWallReach(wall, padding = wall.padding) {
    return wall.size / 2 * Math.SQRT2 + padding;
}

export function getWallCellBounds(wall, worldToGrid, cols, rows, padding = wall.padding) {
    const reach = getWallReach(wall, padding);
    const minGrid = worldToGrid(wall.x - reach, wall.y - reach);
    const maxGrid = worldToGrid(wall.x + reach, wall.y + reach);

    return {
        startCol: Math.max(0, minGrid.col),
        endCol: Math.min(cols - 1, maxGrid.col),
        startRow: Math.max(0, minGrid.row),
        endRow: Math.min(rows - 1, maxGrid.row),
    };
}

export function cellBoundsToWorldBounds(bounds, originX, originY, cellSize) {
    return {
        minX: originX + bounds.startCol * cellSize,
        maxX: originX + (bounds.endCol + 1) * cellSize,
        minY: originY + bounds.startRow * cellSize,
        maxY: originY + (bounds.endRow + 1) * cellSize,
    };
}

export function markWallOnGrid(wall, grid, cols, rows, { worldToGrid, cellCenter, padding = wall.padding, onBlockedCell }) {
    if (wall.isDead) return;

    const halfSize = wall.size / 2;
    const bounds = getWallCellBounds(wall, worldToGrid, cols, rows, padding);
    const cos = Math.cos(-wall.angle);
    const sin = Math.sin(-wall.angle);
    const paddingSq = padding * padding + 0.01;

    for (let col = bounds.startCol; col <= bounds.endCol; col++) {
        for (let row = bounds.startRow; row <= bounds.endRow; row++) {
            const { x: cx, y: cy } = cellCenter(col, row);

            const dx = cx - wall.x;
            const dy = cy - wall.y;

            const localX = dx * cos - dy * sin;
            const localY = dx * sin + dy * cos;

            const distX = Math.max(0, Math.abs(localX) - halfSize);
            const distY = Math.max(0, Math.abs(localY) - halfSize);

            if (distX * distX + distY * distY <= paddingSq) {
                const idx = colRowToIndex(col, row, cols);
                grid[idx] = 1;
                if (onBlockedCell) {
                    onBlockedCell(col, row, idx);
                }
            }
        }
    }
}

export function clearWallCells(grid, cols, bounds) {
    for (let row = bounds.startRow; row <= bounds.endRow; row++) {
        for (let col = bounds.startCol; col <= bounds.endCol; col++) {
            grid[colRowToIndex(col, row, cols)] = 0;
        }
    }
}
