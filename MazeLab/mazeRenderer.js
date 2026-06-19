import { cellInRect } from "../Libraries/Spatial/grid/GridUtils.js";
import { floorBeltEntryExitSides, floorBeltElbowTurn } from "../Libraries/Spatial/grid/FloorCell.js";

const C = {
    void: "#888888",
    floor: "#ffffff",
    wall: "#000000",
    rail: "#000000",
    beltStraight: "#0066ff",
    beltLeft: "#ff8800",
    beltRight: "#cc0066",
    beltBad: "#ff0000",
    padStrip: "#66ff66",
    northStrip: "#ffdd00",
    zoneLine: "#000000",
};

const ARROW = ["↑", "→", "↓", "←"];
const ELBOW_GLYPH = { left: "↰", right: "↱" };

export function autoPxPerCell(playAreaCols, playAreaRows) {
    const panelW = 380;
    const maxW = Math.max(640, window.innerWidth - panelW - 16);
    const maxH = Math.max(640, window.innerHeight - 16);
    const fit = Math.floor(Math.min(maxW / playAreaCols, maxH / playAreaRows));
    return Math.max(8, Math.min(20, fit));
}

export function drawSnakeSplitLayout(ctx, preview, options) {
    const { grid, layout, walkableKeys, playableBounds, beltPlan } = preview;
    const { zones } = layout;
    const cellSize = grid.cellSize;
    const px = options.pxPerCell;
    const layers = options.layers;
    const oCol = playableBounds.boundsCol;
    const oRow = playableBounds.boundsRow;
    const cols = playableBounds.boundsCols;
    const rows = playableBounds.boundsRows;
    const w = cols * px;
    const h = rows * px;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = C.void;
    ctx.fillRect(0, 0, w, h);

    paintCells(ctx, grid, zones, oCol, oRow, cols, rows, px, cellSize, walkableKeys, layers);
    if (layers.zones) paintZoneSeparators(ctx, zones, oCol, oRow, px, cols);
    if (layers.northReserve) paintNorthStrip(ctx, zones.railConfig, layout.northReserveRows, oCol, oRow, px);
    if (layers.rails) paintRails(ctx, grid, layout.rails, oCol, oRow, cols, rows, px, cellSize);
    if (layers.belts && beltPlan) paintBelts(ctx, grid, beltPlan, oCol, oRow, cols, rows, px, cellSize);
}

function rect(gc, gr, oCol, oRow, px) {
    return { x: (gc - oCol) * px, y: (gr - oRow) * px, s: px };
}

function paintCells(ctx, grid, zones, oCol, oRow, cols, rows, px, cellSize, walkableKeys, layers) {
    for (let gr = oRow; gr < oRow + rows; gr++) {
        for (let gc = oCol; gc < oCol + cols; gc++) {
            const { col, row } = grid.worldToGrid(gc * cellSize, gr * cellSize);
            const r = rect(gc, gr, oCol, oRow, px);
            let fill = C.floor;
            if (!cellInRect(col, row, grid.cols, grid.rows)) fill = C.void;
            else if (layers.voxels && grid.isBlocked(col, row)) fill = C.wall;
            else if (layers.walkable && walkableKeys.has(`${col},${row}`)) fill = "#aaf0ff";
            ctx.fillStyle = fill;
            ctx.fillRect(r.x, r.y, r.s, r.s);
        }
    }
    if (layers.zones) {
        tintBand(ctx, zones.paddingConfig, oCol, oRow, px, C.padStrip, 0.35);
        tintBand(ctx, zones.railConfig, oCol, oRow, px, "#e8d4ff", 0.25);
        tintBand(ctx, zones.cavernConfig, oCol, oRow, px, "#ffe0b0", 0.2);
    }
}

function tintBand(ctx, config, oCol, oRow, px, color, alpha) {
    const { boundsCol, boundsRow, boundsCols, boundsRows } = config;
    const r = rect(boundsCol, boundsRow, oCol, oRow, px);
    ctx.fillStyle = color;
    ctx.globalAlpha = alpha;
    ctx.fillRect(r.x, r.y, boundsCols * px, boundsRows * px);
    ctx.globalAlpha = 1;
}

function paintZoneSeparators(ctx, zones, oCol, oRow, px, cols) {
    const y1 = (zones.cavernConfig.boundsRow + zones.cavernConfig.boundsRows - oRow) * px;
    const y2 = (zones.paddingConfig.boundsRow + zones.paddingConfig.boundsRows - oRow) * px;
    const thick = Math.max(4, Math.round(px * 0.35));
    ctx.fillStyle = C.zoneLine;
    ctx.fillRect(0, y1 - thick / 2, cols * px, thick);
    ctx.fillRect(0, y2 - thick / 2, cols * px, thick);
    if (px >= 10) {
        ctx.fillStyle = "#000000";
        ctx.font = `bold ${Math.round(px * 1.1)}px ui-sans-serif, system-ui, sans-serif`;
        const cy = (zones.cavernConfig.boundsRow - oRow + zones.cavernConfig.boundsRows * 0.5) * px;
        const py = (zones.paddingConfig.boundsRow - oRow + zones.paddingConfig.boundsRows * 0.5) * px;
        const ry = (zones.railConfig.boundsRow - oRow + zones.railConfig.boundsRows * 0.5) * px;
        ctx.fillText("CAVERN", 8, cy);
        ctx.fillText("PAD", 8, py);
        ctx.fillText("RAILS", 8, ry);
    }
}

function paintNorthStrip(ctx, railConfig, northReserveRows, oCol, oRow, px) {
    const depth = Math.max(1, Math.round(northReserveRows));
    const r = rect(railConfig.boundsCol, railConfig.boundsRow, oCol, oRow, px);
    ctx.fillStyle = C.northStrip;
    ctx.globalAlpha = 0.85;
    ctx.fillRect(r.x, r.y, railConfig.boundsCols * px, depth * px);
    ctx.globalAlpha = 1;
    ctx.fillStyle = C.zoneLine;
    const bar = Math.max(3, px * 0.2);
    ctx.fillRect(r.x, r.y + depth * px - bar, railConfig.boundsCols * px, bar);
}

function paintRails(ctx, grid, rails, oCol, oRow, cols, rows, px, cellSize) {
    const bar = Math.max(Math.ceil(px * 0.45), 4);
    ctx.fillStyle = C.rail;
    for (let i = 0; i < rails.length; i++) {
        const rail = rails[i];
        if (rail.col < oCol || rail.col >= oCol + cols) continue;
        if (rail.row < oRow || rail.row >= oRow + rows) continue;
        const { col, row } = grid.worldToGrid(rail.col * cellSize, rail.row * cellSize);
        if (!cellInRect(col, row, grid.cols, grid.rows)) continue;
        const r = rect(rail.col, rail.row, oCol, oRow, px);
        if (rail.side === 0) ctx.fillRect(r.x, r.y, r.s, bar);
        else if (rail.side === 1) ctx.fillRect(r.x + r.s - bar, r.y, bar, r.s);
        else if (rail.side === 2) ctx.fillRect(r.x, r.y + r.s - bar, r.s, bar);
        else ctx.fillRect(r.x, r.y, bar, r.s);
    }
}

function paintBelts(ctx, grid, beltPlan, oCol, oRow, cols, rows, px, cellSize) {
    const belts = beltPlan.floorBelts;
    const fontPx = Math.max(10, Math.floor(px * 0.72));
    ctx.font = `bold ${fontPx}px ui-sans-serif, system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (let i = 0; i < belts.length; i++) {
        const belt = belts[i];
        const { x, y } = grid.gridToWorld(belt.col, belt.row);
        const gc = Math.round(x / cellSize);
        const gr = Math.round(y / cellSize);
        if (gc < oCol || gc >= oCol + cols || gr < oRow || gr >= oRow + rows) continue;
        const r = rect(gc, gr, oCol, oRow, px);
        const turn = floorBeltElbowTurn(belt.kind);
        const bad = beltPlan.validation?.ok === false;
        ctx.fillStyle = bad ? C.beltBad : turn === "left" ? C.beltLeft : turn === "right" ? C.beltRight : C.beltStraight;
        ctx.fillRect(r.x + 1, r.y + 1, r.s - 2, r.s - 2);
        ctx.fillStyle = "#ffffff";
        ctx.strokeStyle = "#000000";
        ctx.lineWidth = Math.max(2, px * 0.08);
        ctx.strokeRect(r.x + 1.5, r.y + 1.5, r.s - 3, r.s - 3);
        let glyph = "→";
        if (turn) glyph = ELBOW_GLYPH[turn];
        else glyph = ARROW[floorBeltEntryExitSides(belt.kind, belt.facingIndex).exitSide];
        ctx.fillStyle = "#000000";
        ctx.fillText(glyph, r.x + r.s * 0.5, r.y + r.s * 0.52);
    }
}

export function suggestedPxPerCell(playAreaCols) {
    return autoPxPerCell(playAreaCols, playAreaCols);
}

export function layoutStats(preview) {
    const { grid, layout, walkableKeys, playableBounds, beltPlan } = preview;
    const cellSize = grid.cellSize;
    let voxelCells = 0;
    let openCells = 0;
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
            if (floorBeltElbowTurn(beltPlan.floorBelts[i].kind)) elbowCount++;
            else straightCount++;
        }
    }
    return {
        seed: layout.mapSeed,
        playArea: `${boundsCols}×${boundsRows}`,
        voxelCells,
        openCells,
        railEdges: layout.rails.length,
        navWalkable: walkableKeys.size,
        beltCells: beltPlan?.floorBelts.length ?? 0,
        beltStraight: straightCount,
        beltElbows: elbowCount,
        beltPaths: beltPlan?.pathCount ?? 0,
        beltValid: beltPlan?.validation?.ok ?? null,
        beltError: beltPlan?.validation?.error ?? null,
    };
}
