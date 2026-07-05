import {  worldColAtOrigin, worldRowAtOrigin, gridCenterXAtOrigin, gridCenterYAtOrigin  } from "../Spatial/spatial.js";
/** @typedef {{ minX: number, minY: number, cellSize: number, cols: number, rows: number, key: string }} GridFrame */
/** Stable id for obstacle-grid frame — resize or origin shift changes this. */
export function gridNavFrameKey(grid) {
    return `${grid.cols}:${grid.rows}:${grid.minX}:${grid.minY}:${grid.cellSize}`;
}
/** @param {{ minX: number, minY: number, cellSize: number, cols: number, rows: number }} grid */
export function gridFrameFromGrid(grid) {
    return { minX: grid.minX, minY: grid.minY, cellSize: grid.cellSize, cols: grid.cols, rows: grid.rows, key: gridNavFrameKey(grid) };
}
export function snapshotWorldCol(frame, x) {
    return worldColAtOrigin(x, frame.minX, frame.cellSize);
}
export function snapshotWorldRow(frame, y) {
    return worldRowAtOrigin(y, frame.minY, frame.cellSize);
}
export function snapshotGridCenterX(frame, col) {
    return gridCenterXAtOrigin(col, frame.minX, frame.cellSize * 0.5);
}
export function snapshotGridCenterY(frame, row) {
    return gridCenterYAtOrigin(row, frame.minY, frame.cellSize * 0.5);
}
export function snapshotWorldToGrid(frame, x, y) {
    return { col: snapshotWorldCol(frame, x), row: snapshotWorldRow(frame, y) };
}
export function snapshotGridToWorld(frame, col, row) {
    return { x: snapshotGridCenterX(frame, col), y: snapshotGridCenterY(frame, row) };
}
