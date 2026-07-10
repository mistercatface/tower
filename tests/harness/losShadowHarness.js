import { WorldObstacleGrid } from "../../Libraries/Spatial/spatial.js";

export function makeTestObstacleGrid(cols, rows, cellSize = 16) {
    const grid = new WorldObstacleGrid(cellSize);
    const width = cols * cellSize;
    const height = rows * cellSize;
    grid.rebuildFixed(width * 0.5, height * 0.5, width, height);
    return grid;
}

export function stampWallRect(grid, col0, row0, cols, rows, heightLevel = 1) {
    const cells = new Uint8Array(cols * rows);
    cells.fill(1);
    grid.stampStaticWalls(col0 + row0 * grid.cols, grid.cols, grid.rows, cols, cols * rows, cells, { additive: true, heightLevel });
}

export function stampRailWallEdge(grid, col, row, side, capHeightLevel = 1, thicknessLevel = 1) {
    grid.stampCellEdge(grid.idx(col, row), side, capHeightLevel, thicknessLevel);
}

export function makeTestViewport(x, y, halfW = 200, halfH = 200, zoom = 1, cameraHeight = 160, perspectiveStrength = 1) {
    const cx = halfW * zoom;
    const cy = halfH * zoom;
    return {
        x,
        y,
        zoom,
        cx,
        cy,
        cameraHeight,
        perspectiveStrength,
        worldToScreenF32(buf, o, worldX, worldY) {
            buf[o] = (worldX - x) * zoom + cx;
            buf[o + 1] = (worldY - y) * zoom + cy;
        },
    };
}
