import {  WorldObstacleGrid  } from "../Libraries/Spatial/spatial.js";

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
    const layout = {
        originIdx: col0 + row0 * grid.cols,
        gridCols: grid.cols,
        gridRows: grid.rows,
        strideCols: cols,
        cellCount: cols * rows,
    };
    grid.stampStaticWalls(layout, cells, { additive: true, heightLevel });
}

export function stampRailWallEdge(grid, col, row, side, capHeightLevel = 1, thicknessLevel = 1) {
    grid.stampCellEdge(col + row * grid.cols, side, capHeightLevel, thicknessLevel);
}

export function makeTestViewport(x, y, halfW = 200, halfH = 200, zoom = 1, cameraHeight = 160, perspectiveStrength = 1) {
    const bounds = { minX: x - halfW, minY: y - halfH, maxX: x + halfW, maxY: y + halfH };
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
        bounds(tier) {
            return bounds;
        },
        worldToScreenInto(out, worldX, worldY) {
            out.x = (worldX - x) * zoom + cx;
            out.y = (worldY - y) * zoom + cy;
            return out;
        },
        worldToScreen(worldX, worldY) {
            return { x: (worldX - x) * zoom + cx, y: (worldY - y) * zoom + cy };
        },
    };
}
