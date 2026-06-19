import { cellInRect } from "../Libraries/Spatial/grid/GridUtils.js";
import { floorBeltEntryExitSides, floorBeltElbowTurn } from "../Libraries/Spatial/grid/FloorCell.js";

const BELT_COLORS = {
    straight: "#5ec4ff",
    elbowLeft: "#ffb454",
    elbowRight: "#ff7eb6",
    invalid: "#ff4444",
};

export function drawSnakeSplitLayout(ctx, preview, options) {
    const { grid, layout, walkableKeys, playableBounds, beltPlan } = preview;
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
    if (layers.belts && beltPlan) drawBelts(ctx, grid, beltPlan, originGlobalCol, originGlobalRow, cols, rows, pxPerCell, cellSize, options.beltInvalidKeys);
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

function gridCellCenterCanvas(grid, col, row, originGlobalCol, originGlobalRow, pxPerCell, cellSize) {
    const { x, y } = grid.gridToWorld(col, row);
    const globalCol = Math.round(x / cellSize);
    const globalRow = Math.round(y / cellSize);
    const topLeft = globalToCanvas(globalCol, globalRow, originGlobalCol, originGlobalRow, pxPerCell);
    return { x: topLeft.x + pxPerCell * 0.5, y: topLeft.y + pxPerCell * 0.5 };
}

function drawBelts(ctx, grid, beltPlan, originGlobalCol, originGlobalRow, cols, rows, pxPerCell, cellSize, invalidKeys) {
    const belts = beltPlan.floorBelts;
    const invalid = invalidKeys ?? new Set();
    for (let i = 0; i < belts.length; i++) {
        const belt = belts[i];
        const { x, y } = gridCellCenterCanvas(grid, belt.col, belt.row, originGlobalCol, originGlobalRow, pxPerCell, cellSize);
        const { x: wx, y: wy } = grid.gridToWorld(belt.col, belt.row);
        const gc = Math.round(wx / cellSize);
        const gr = Math.round(wy / cellSize);
        if (gc < originGlobalCol || gc >= originGlobalCol + cols || gr < originGlobalRow || gr >= originGlobalRow + rows) continue;
        const key = `${belt.col},${belt.row}`;
        const turn = floorBeltElbowTurn(belt.kind);
        const color = invalid.has(key) ? BELT_COLORS.invalid : turn === "left" ? BELT_COLORS.elbowLeft : turn === "right" ? BELT_COLORS.elbowRight : BELT_COLORS.straight;
        const radius = pxPerCell * 0.34;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
        if (turn) {
            const { entrySide, exitSide } = floorBeltEntryExitSides(belt.kind, belt.facingIndex);
            drawBeltSideTick(ctx, x, y, entrySide, pxPerCell, radius, true);
            drawBeltSideTick(ctx, x, y, exitSide, pxPerCell, radius, false);
        } else {
            const { exitSide } = floorBeltEntryExitSides(belt.kind, belt.facingIndex);
            drawBeltArrow(ctx, x, y, exitSide, pxPerCell, radius);
        }
    }
}

function drawBeltSideTick(ctx, cx, cy, side, pxPerCell, radius, isEntry) {
    const len = radius * 0.95;
    let x0 = cx;
    let y0 = cy;
    let x1 = cx;
    let y1 = cy;
    if (side === 0) {
        y0 = cy + (isEntry ? len : -len * 0.35);
        y1 = cy - len;
    } else if (side === 1) {
        x0 = cx - (isEntry ? len : -len * 0.35);
        x1 = cx + len;
    } else if (side === 2) {
        y0 = cy - (isEntry ? len : -len * 0.35);
        y1 = cy + len;
    } else {
        x0 = cx + (isEntry ? len : -len * 0.35);
        x1 = cx - len;
    }
    ctx.strokeStyle = "rgba(0,0,0,0.55)";
    ctx.lineWidth = Math.max(1, pxPerCell * 0.12);
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
}

function drawBeltArrow(ctx, cx, cy, exitSide, pxPerCell, radius) {
    const len = radius * 1.15;
    let tipX = cx;
    let tipY = cy;
    let tailX = cx;
    let tailY = cy;
    if (exitSide === 0) {
        tipY = cy - len;
        tailY = cy + radius * 0.2;
    } else if (exitSide === 1) {
        tipX = cx + len;
        tailX = cx - radius * 0.2;
    } else if (exitSide === 2) {
        tipY = cy + len;
        tailY = cy - radius * 0.2;
    } else {
        tipX = cx - len;
        tailX = cx + radius * 0.2;
    }
    ctx.strokeStyle = "rgba(0,0,0,0.65)";
    ctx.fillStyle = "rgba(0,0,0,0.65)";
    ctx.lineWidth = Math.max(1, pxPerCell * 0.1);
    ctx.beginPath();
    ctx.moveTo(tailX, tailY);
    ctx.lineTo(tipX, tipY);
    ctx.stroke();
    const head = pxPerCell * 0.18;
    ctx.beginPath();
    if (exitSide === 0) {
        ctx.moveTo(tipX, tipY);
        ctx.lineTo(tipX - head, tipY + head * 1.4);
        ctx.lineTo(tipX + head, tipY + head * 1.4);
    } else if (exitSide === 1) {
        ctx.moveTo(tipX, tipY);
        ctx.lineTo(tipX - head * 1.4, tipY - head);
        ctx.lineTo(tipX - head * 1.4, tipY + head);
    } else if (exitSide === 2) {
        ctx.moveTo(tipX, tipY);
        ctx.lineTo(tipX - head, tipY - head * 1.4);
        ctx.lineTo(tipX + head, tipY - head * 1.4);
    } else {
        ctx.moveTo(tipX, tipY);
        ctx.lineTo(tipX + head * 1.4, tipY - head);
        ctx.lineTo(tipX + head * 1.4, tipY + head);
    }
    ctx.closePath();
    ctx.fill();
}

export function layoutStats(preview) {
    const { grid, layout, walkableKeys, playableBounds, beltPlan } = preview;
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
    let elbowCount = 0;
    let straightCount = 0;
    if (beltPlan) {
        for (let i = 0; i < beltPlan.floorBelts.length; i++) {
            const turn = floorBeltElbowTurn(beltPlan.floorBelts[i].kind);
            if (turn) elbowCount++;
            else straightCount++;
        }
    }
    return {
        seed: layout.mapSeed,
        playArea: `${boundsCols}×${boundsRows}`,
        voxelCells,
        openCells,
        railEdges: railCount,
        navWalkable: walkableKeys.size,
        beltCells: beltPlan?.floorBelts.length ?? 0,
        beltStraight: straightCount,
        beltElbows: elbowCount,
        beltPaths: beltPlan?.pathCount ?? 0,
        beltValid: beltPlan?.validation?.ok ?? null,
        beltError: beltPlan?.validation?.error ?? null,
    };
}
