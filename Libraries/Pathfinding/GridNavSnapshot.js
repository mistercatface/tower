import { worldToGridAtOrigin, gridToWorldAtOrigin } from "../Spatial/grid/GridCoords.js";
/** @typedef {{ minX: number, minY: number, cellSize: number, cols: number, rows: number, key: string }} GridFrame */
/** Stable id for obstacle-grid frame — resize or origin shift changes this. */
export function gridNavFrameKey(grid) {
    return `${grid.cols}:${grid.rows}:${grid.minX}:${grid.minY}:${grid.cellSize}`;
}
/** @param {{ minX: number, minY: number, cellSize: number, cols: number, rows: number }} grid */
export function gridFrameFromGrid(grid) {
    return { minX: grid.minX, minY: grid.minY, cellSize: grid.cellSize, cols: grid.cols, rows: grid.rows, key: gridNavFrameKey(grid) };
}
export function snapshotWorldToGrid(frame, x, y) {
    const { minX, minY, cellSize } = frame;
    return worldToGridAtOrigin(x, y, minX, minY, cellSize);
}
export function snapshotGridToWorld(frame, col, row) {
    const { minX, minY, cellSize } = frame;
    return gridToWorldAtOrigin(col, row, minX, minY, cellSize);
}
