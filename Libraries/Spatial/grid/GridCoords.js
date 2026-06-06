import { circleIntersectsAabb } from "../../Math/Aabb2D.js";
/** Grid anchored at a world-space min corner (ObstacleGrid). */
export function worldToGridAtOrigin(x, y, minX, minY, cellSize) {
    return { col: Math.floor((x - minX) / cellSize), row: Math.floor((y - minY) / cellSize) };
}
export function gridToWorldAtOrigin(col, row, minX, minY, cellSize) {
    return { x: minX + col * cellSize + cellSize / 2, y: minY + row * cellSize + cellSize / 2 };
}
/** Grid centered on a world point with pixel offsets (FlowFieldGrid). */
export function worldToGridCentered(x, y, centerX, centerY, offsetX, offsetY, cellSize) {
    return { col: Math.floor((x - centerX + offsetX) / cellSize), row: Math.floor((y - centerY + offsetY) / cellSize) };
}
export function gridToWorldCentered(col, row, centerX, centerY, offsetX, offsetY, cellSize) {
    return { x: col * cellSize + centerX - offsetX + cellSize / 2, y: row * cellSize + centerY - offsetY + cellSize / 2 };
}
export function getCellBoundsCentered(col, row, centerX, centerY, offsetX, offsetY, cellSize) {
    const minX = col * cellSize + centerX - offsetX;
    const minY = row * cellSize + centerY - offsetY;
    return { minX, minY, maxX: minX + cellSize, maxY: minY + cellSize };
}
export function cellBoundsToWorldBounds(bounds, originX, originY, cellSize) {
    return { minX: originX + bounds.startCol * cellSize, maxX: originX + (bounds.endCol + 1) * cellSize, minY: originY + bounds.startRow * cellSize, maxY: originY + (bounds.endRow + 1) * cellSize };
}
export function entityIntersectsCellBounds(x, y, radius, bounds) {
    return circleIntersectsAabb(x, y, radius, bounds);
}
/** Snap a world point to the min corner of its obstacle-grid cell. */
export function snapWorldToCellOrigin(worldX, worldY, minX, minY, cellSize) {
    const col = Math.floor((worldX - minX) / cellSize);
    const row = Math.floor((worldY - minY) / cellSize);
    return { col, row, x: minX + col * cellSize, y: minY + row * cellSize };
}
