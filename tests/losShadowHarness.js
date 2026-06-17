import { WorldObstacleGrid } from "../Libraries/Spatial/grid/WorldObstacleGrid.js";
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
    grid.stampStaticWalls(col0, row0, cols, rows, cells, { additive: true, heightLevel });
}
export function stampRailWallEdge(grid, col, row, side, capHeightLevel = 1, thicknessLevel = 1) {
    grid.stampCellEdge(col, row, side, capHeightLevel, thicknessLevel);
}
export function createMockCanvas2d(width, height) {
    const ops = [];
    let gco = "source-over";
    let alpha = 1;
    return {
        ops,
        canvas: { width, height },
        save() {
            ops.push({ op: "save" });
        },
        restore() {
            ops.push({ op: "restore" });
        },
        beginPath() {
            ops.push({ op: "beginPath" });
        },
        moveTo(x, y) {
            ops.push({ op: "moveTo", x, y });
        },
        lineTo(x, y) {
            ops.push({ op: "lineTo", x, y });
        },
        closePath() {
            ops.push({ op: "closePath" });
        },
        fill() {
            ops.push({ op: "fill" });
        },
        fillRect(x, y, w, h) {
            ops.push({ op: "fillRect", x, y, w, h });
        },
        clearRect(x, y, w, h) {
            ops.push({ op: "clearRect", x, y, w, h });
        },
        setTransform() {
            ops.push({ op: "setTransform" });
        },
        arc(x, y, r, start, end) {
            ops.push({ op: "arc", x, y, r, start, end });
        },
        drawImage() {
            ops.push({ op: "drawImage" });
        },
        createRadialGradient() {
            return { addColorStop() {} };
        },
        set globalCompositeOperation(v) {
            gco = v;
            ops.push({ op: "gco", value: v });
        },
        get globalCompositeOperation() {
            return gco;
        },
        set globalAlpha(v) {
            alpha = v;
            ops.push({ op: "alpha", value: v });
        },
        get globalAlpha() {
            return alpha;
        },
        set fillStyle(v) {
            ops.push({ op: "fillStyle", value: v });
        },
        clip() {
            ops.push({ op: "clip" });
        },
        rect(x, y, w, h) {
            ops.push({ op: "rect", x, y, w, h });
        },
        getTransform() {
            return { a: 1 };
        },
    };
}
export function makeTestCamera(viewerX, viewerY, cameraHeight = 160, strength = 1) {
    return { viewerX, viewerY, cameraHeight, strength };
}
export function makeTestViewport(x, y, halfW = 200, halfH = 200, zoom = 1) {
    const bounds = { minX: x - halfW, minY: y - halfH, maxX: x + halfW, maxY: y + halfH };
    const cx = halfW * zoom;
    const cy = halfH * zoom;
    return {
        x,
        y,
        zoom,
        cx,
        cy,
        boundsDraw: bounds,
        boundsClip: bounds,
        worldToScreen(worldX, worldY) {
            return { x: (worldX - x) * zoom + cx, y: (worldY - y) * zoom + cy };
        },
    };
}
