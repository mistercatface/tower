import { cellInRect } from "../Libraries/Spatial/grid/GridUtils.js";
export function drawSnakeSplitLayout(ctx, preview, options) {
    const { grid, layout, walkableKeys, playableBounds } = preview;
    const { zones } = layout;
    const cellSize = grid.cellSize;
    const pxPerCell = options.pxPerCell;
    const layers = options.layers;
    const originGlobalCol = playableBounds.boundsCol;
    const originGlobalRow = playableBounds.boundsRow;
    const cols = playableBounds.boundsCols;
    const rows = playableBounds.boundsRows;
    const width = cols * pxPerCell;
    const height = rows * pxPerCell;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#0d1117";
    ctx.fillRect(0, 0, width, height);
    if (layers.zones) drawZoneBands(ctx, zones, originGlobalCol, originGlobalRow, pxPerCell);
    if (layers.voxels) drawVoxels(ctx, grid, layout.cavern, originGlobalCol, originGlobalRow, cols, rows, pxPerCell, cellSize);
    if (layers.walkable) drawWalkable(ctx, grid, walkableKeys, originGlobalCol, originGlobalRow, cols, rows, pxPerCell, cellSize);
    if (layers.rails) drawRails(ctx, grid, layout.rails, originGlobalCol, originGlobalRow, cols, rows, pxPerCell, cellSize);
    if (layers.northReserve) drawNorthReserve(ctx, zones.railConfig, layout.northReserveRows, originGlobalCol, originGlobalRow, pxPerCell);
}
function globalToCanvas(globalCol, globalRow, originGlobalCol, originGlobalRow, pxPerCell) {
    return { x: (globalCol - originGlobalCol) * pxPerCell, y: (globalRow - originGlobalRow) * pxPerCell };
}
function drawZoneBands(ctx, zones, originGlobalCol, originGlobalRow, pxPerCell) {
    const bands = [
        { config: zones.cavernConfig, fill: "rgba(255, 152, 0, 0.06)" },
        { config: zones.paddingConfig, fill: "rgba(80, 200, 120, 0.08)" },
        { config: zones.railConfig, fill: "rgba(224, 64, 251, 0.06)" },
    ];
    for (let i = 0; i < bands.length; i++) {
        const band = bands[i];
        const { boundsCol, boundsRow, boundsCols, boundsRows } = band.config;
        const topLeft = globalToCanvas(boundsCol, boundsRow, originGlobalCol, originGlobalRow, pxPerCell);
        ctx.fillStyle = band.fill;
        ctx.fillRect(topLeft.x, topLeft.y, boundsCols * pxPerCell, boundsRows * pxPerCell);
    }
}
function drawNorthReserve(ctx, railConfig, northReserveRows, originGlobalCol, originGlobalRow, pxPerCell) {
    const depth = Math.max(1, Math.round(northReserveRows));
    const topLeft = globalToCanvas(railConfig.boundsCol, railConfig.boundsRow, originGlobalCol, originGlobalRow, pxPerCell);
    ctx.fillStyle = "rgba(255, 220, 80, 0.12)";
    ctx.fillRect(topLeft.x, topLeft.y, railConfig.boundsCols * pxPerCell, depth * pxPerCell);
    ctx.strokeStyle = "rgba(255, 220, 80, 0.45)";
    ctx.lineWidth = 1;
    ctx.strokeRect(topLeft.x + 0.5, topLeft.y + 0.5, railConfig.boundsCols * pxPerCell - 1, depth * pxPerCell - 1);
}
function drawVoxels(ctx, grid, cavernStamp, originGlobalCol, originGlobalRow, cols, rows, pxPerCell, cellSize) {
    ctx.fillStyle = "#3d4450";
    for (let gr = originGlobalRow; gr < originGlobalRow + rows; gr++)
        for (let gc = originGlobalCol; gc < originGlobalCol + cols; gc++) {
            const { col, row } = grid.worldToGrid(gc * cellSize, gr * cellSize);
            if (!cellInRect(col, row, grid.cols, grid.rows)) continue;
            if (grid.isBlocked(col, row)) {
                const { x, y } = globalToCanvas(gc, gr, originGlobalCol, originGlobalRow, pxPerCell);
                ctx.fillRect(x, y, pxPerCell, pxPerCell);
            }
        }
}
function drawWalkable(ctx, grid, walkableKeys, originGlobalCol, originGlobalRow, cols, rows, pxPerCell, cellSize) {
    ctx.fillStyle = "rgba(100, 220, 140, 0.22)";
    for (let gr = originGlobalRow; gr < originGlobalRow + rows; gr++)
        for (let gc = originGlobalCol; gc < originGlobalCol + cols; gc++) {
            const { col, row } = grid.worldToGrid(gc * cellSize, gr * cellSize);
            if (!walkableKeys.has(`${col},${row}`)) continue;
            const { x, y } = globalToCanvas(gc, gr, originGlobalCol, originGlobalRow, pxPerCell);
            ctx.fillRect(x, y, pxPerCell, pxPerCell);
        }
}
function drawRails(ctx, grid, rails, originGlobalCol, originGlobalRow, cols, rows, pxPerCell, cellSize) {
    ctx.strokeStyle = "#e040fb";
    ctx.lineWidth = Math.max(1, pxPerCell * 0.18);
    ctx.lineCap = "square";
    for (let i = 0; i < rails.length; i++) {
        const rail = rails[i];
        if (rail.col < originGlobalCol || rail.col >= originGlobalCol + cols) continue;
        if (rail.row < originGlobalRow || rail.row >= originGlobalRow + rows) continue;
        const { col, row } = grid.worldToGrid(rail.col * cellSize, rail.row * cellSize);
        if (!cellInRect(col, row, grid.cols, grid.rows)) continue;
        const { x, y } = globalToCanvas(rail.col, rail.row, originGlobalCol, originGlobalRow, pxPerCell);
        const inset = pxPerCell * 0.08;
        const max = pxPerCell - inset;
        ctx.beginPath();
        if (rail.side === 0) {
            ctx.moveTo(x + inset, y + inset);
            ctx.lineTo(x + max, y + inset);
        } else if (rail.side === 1) {
            ctx.moveTo(x + max, y + inset);
            ctx.lineTo(x + max, y + max);
        } else if (rail.side === 2) {
            ctx.moveTo(x + inset, y + max);
            ctx.lineTo(x + max, y + max);
        } else {
            ctx.moveTo(x + inset, y + inset);
            ctx.lineTo(x + inset, y + max);
        }
        ctx.stroke();
    }
}
export function layoutStats(preview) {
    const { grid, layout, walkableKeys, playableBounds } = preview;
    const cellSize = grid.cellSize;
    let voxelCells = 0;
    let openCells = 0;
    let railCount = layout.rails.length;
    const { boundsCol, boundsRow, boundsCols, boundsRows } = playableBounds;
    for (let gr = boundsRow; gr < boundsRow + boundsRows; gr++)
        for (let gc = boundsCol; gc < boundsCol + boundsCols; gc++) {
            const { col, row } = grid.worldToGrid(gc * cellSize, gr * cellSize);
            if (!cellInRect(col, row, grid.cols, grid.rows)) continue;
            if (grid.isBlocked(col, row)) voxelCells++;
            else openCells++;
        }
    return { seed: layout.mapSeed, playArea: `${boundsCols}×${boundsRows}`, voxelCells, openCells, railEdges: railCount, navWalkable: walkableKeys.size };
}
