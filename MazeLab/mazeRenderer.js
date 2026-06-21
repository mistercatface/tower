import { cellInRect, CARDINAL_OFFSETS, colRowToIndex, gridCellLayout } from "../Libraries/Spatial/grid/GridUtils.js";
import { floorBeltEntryExitSides, floorBeltElbowTurn } from "../Libraries/Spatial/grid/FloorCell.js";
import { countNavWalkableFlags, readNavWalkableFlag } from "../Libraries/Procedural/Mazes/navWalkableIndex.js";
const C = {
    void: "#09090b", // Zinc-950 (Out of bounds void background)
    floor: "#27272a", // Zinc-800 (Walkable floor tiles)
    wall: "#0f0f11", // Slate-950 (Voxel solid walls)
    rail: "#f3f4f6", // Gray-100 (Steel/white rails)
    beltStraight: "#2563eb", // Blue-600
    beltLeft: "#059669", // Emerald-600
    beltRight: "#7c3aed", // Violet-600
    beltBad: "#dc2626", // Red-600 (Error belt)
    padStrip: "#3b82f6", // Blue (translucent overlay)
    northStrip: "#eab308", // Amber yellow (translucent overlay)
    zoneLine: "rgba(255, 255, 255, 0.15)",
};
const ARROW = ["↑", "→", "↓", "←"];
const ELBOW_GLYPH = { left: "↰", right: "↱" };
export function autoPxPerCell(playAreaCols, playAreaRows) {
    const panelW = 340;
    const maxW = Math.max(640, window.innerWidth - panelW - 48);
    const maxH = Math.max(640, window.innerHeight - 48);
    const fit = Math.floor(Math.min(maxW / playAreaCols, maxH / playAreaRows));
    return Math.max(8, Math.min(20, fit));
}
export function drawSnakeSplitLayout(ctx, preview, options) {
    const { grid, layout, navWalkableIndex, playableBounds, beltPlan } = preview;
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
    paintCells(ctx, grid, zones, oCol, oRow, cols, rows, px, cellSize, navWalkableIndex, layers);
    if (layers.zones) paintZoneSeparators(ctx, zones, oCol, oRow, px, cols);
    if (layers.northReserve) paintNorthStrip(ctx, zones.railConfig, layout.northReserveRows, oCol, oRow, px);
    if (layers.rails) paintRails(ctx, grid, layout.rails, oCol, oRow, cols, rows, px, cellSize);
    if (layers.belts && beltPlan) paintBelts(ctx, grid, beltPlan, oCol, oRow, cols, rows, px, cellSize);
}
function rect(gc, gr, oCol, oRow, px) {
    return { x: (gc - oCol) * px, y: (gr - oRow) * px, s: px };
}
function paintCells(ctx, grid, zones, oCol, oRow, cols, rows, px, cellSize, navWalkableIndex, layers) {
    const gap = px >= 8 ? 1 : 0;
    for (let gr = oRow; gr < oRow + rows; gr++)
        for (let gc = oCol; gc < oCol + cols; gc++) {
            const { col, row } = grid.worldToGrid(gc * cellSize, gr * cellSize);
            const r = rect(gc, gr, oCol, oRow, px);
            let fill = C.floor;
            if (!cellInRect(col, row, grid.cols, grid.rows)) fill = C.void;
            else if (layers.voxels && grid.isBlocked(col, row)) fill = C.wall;
            else if (layers.walkable && readNavWalkableFlag(navWalkableIndex.flags, navWalkableIndex.cols, col, row)) fill = "#1e3a8a"; // Beautiful deep navy for walkable
            ctx.fillStyle = fill;
            ctx.fillRect(r.x, r.y, r.s - gap, r.s - gap);
        }
    if (layers.zones) {
        tintBand(ctx, zones.paddingConfig, oCol, oRow, px, C.padStrip, 0.08);
        tintBand(ctx, zones.railConfig, oCol, oRow, px, "#a855f7", 0.06);
        tintBand(ctx, zones.cavernConfig, oCol, oRow, px, "#f59e0b", 0.06);
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
    const thick = Math.max(2, Math.round(px * 0.15));
    ctx.fillStyle = C.zoneLine;
    ctx.fillRect(0, y1 - thick / 2, cols * px, thick);
    ctx.fillRect(0, y2 - thick / 2, cols * px, thick);
    if (px >= 10) {
        ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
        ctx.font = `bold ${Math.round(px * 0.85)}px ui-sans-serif, system-ui, -apple-system, sans-serif`;
        const cy = (zones.cavernConfig.boundsRow - oRow + zones.cavernConfig.boundsRows * 0.5) * px;
        const py = (zones.paddingConfig.boundsRow - oRow + zones.paddingConfig.boundsRows * 0.5) * px;
        const ry = (zones.railConfig.boundsRow - oRow + zones.railConfig.boundsRows * 0.5) * px;
        ctx.fillText("CAVERN", 12, cy);
        ctx.fillText("PAD", 12, py);
        ctx.fillText("RAILS", 12, ry);
    }
}
function paintNorthStrip(ctx, railConfig, northReserveRows, oCol, oRow, px) {
    const depth = Math.max(1, Math.round(northReserveRows));
    const r = rect(railConfig.boundsCol, railConfig.boundsRow, oCol, oRow, px);
    ctx.fillStyle = C.northStrip;
    ctx.globalAlpha = 0.15; // Much lower alpha so contents underneath are clearly visible!
    ctx.fillRect(r.x, r.y, railConfig.boundsCols * px, depth * px);
    ctx.globalAlpha = 1;
    ctx.fillStyle = C.zoneLine;
    const bar = Math.max(2, px * 0.12);
    ctx.fillRect(r.x, r.y + depth * px - bar, railConfig.boundsCols * px, bar);
}
function paintRails(ctx, grid, rails, oCol, oRow, cols, rows, px, cellSize) {
    const bar = Math.max(Math.ceil(px * 0.25), 2); // Thinner rails for crisp look
    const half = Math.floor(bar / 2);
    ctx.fillStyle = C.rail;
    for (let i = 0; i < rails.length; i++) {
        const rail = rails[i];
        if (rail.col < oCol || rail.col >= oCol + cols) continue;
        if (rail.row < oRow || rail.row >= oRow + rows) continue;
        const { col, row } = grid.worldToGrid(rail.col * cellSize, rail.row * cellSize);
        if (!cellInRect(col, row, grid.cols, grid.rows)) continue;
        // Critical Fix: Only draw rail walls if they actually exist on the grid (weren't cleared)
        if (!grid.hasCellEdge(col, row, rail.side)) continue;
        const r = rect(rail.col, rail.row, oCol, oRow, px);
        if (rail.side === 0) ctx.fillRect(r.x, r.y - half, r.s, bar);
        else if (rail.side === 1) ctx.fillRect(r.x + r.s - half, r.y, bar, r.s);
        else if (rail.side === 2) ctx.fillRect(r.x, r.y + r.s - half, r.s, bar);
        else ctx.fillRect(r.x - half, r.y, bar, r.s);
    }
}
function paintBelts(ctx, grid, beltPlan, oCol, oRow, cols, rows, px, cellSize) {
    const belts = beltPlan.floorBelts;
    const layout = gridCellLayout(grid);
    const footprint = beltPlan.validation?.footprint ?? new Set(belts.map((b) => colRowToIndex(b.col, b.row, grid.cols)));
    const beltsByCell = beltPlan.validation?.beltsByCell ?? new Map(belts.map((b) => [colRowToIndex(b.col, b.row, grid.cols), b]));
    const mouthExteriorIndices = beltPlan.mouthExteriorIndices ?? new Set();
    const gap = px >= 8 ? 1 : 0;
    for (let i = 0; i < belts.length; i++) {
        const belt = belts[i];
        const { x, y } = grid.gridToWorld(belt.col, belt.row);
        const gc = Math.round(x / cellSize);
        const gr = Math.round(y / cellSize);
        if (gc < oCol || gc >= oCol + cols || gr < oRow || gr >= oRow + rows) continue;
        const r = rect(gc, gr, oCol, oRow, px);
        const turn = floorBeltElbowTurn(belt.kind);
        // Check per-cell validation so we only color-code broken/dead-end belts red,
        // rather than painting the entire grid of belts red.
        const idx = colRowToIndex(belt.col, belt.row, grid.cols);
        const { entrySide, exitSide } = floorBeltEntryExitSides(belt.kind, belt.facingIndex);
        const entry = { col: belt.col + CARDINAL_OFFSETS[entrySide].dc, row: belt.row + CARDINAL_OFFSETS[entrySide].dr };
        const exit = { col: belt.col + CARDINAL_OFFSETS[exitSide].dc, row: belt.row + CARDINAL_OFFSETS[exitSide].dr };
        const entryIdx = colRowToIndex(entry.col, entry.row, grid.cols);
        const exitIdx = colRowToIndex(exit.col, exit.row, grid.cols);
        const entryInFootprint = footprint.has(entryIdx);
        const exitInFootprint = footprint.has(exitIdx);
        let isBad = false;
        if (entryInFootprint) {
            const entryBelt = beltsByCell.get(entryIdx);
            const entryExit = floorBeltEntryExitSides(entryBelt.kind, entryBelt.facingIndex).exitSide;
            if (entryExit !== (entrySide + 2) % 4) isBad = true;
        }
        if (exitInFootprint) {
            const exitBelt = beltsByCell.get(exitIdx);
            const exitEntry = floorBeltEntryExitSides(exitBelt.kind, exitBelt.facingIndex).entrySide;
            if (exitEntry !== (exitSide + 2) % 4) isBad = true;
        }
        if (!entryInFootprint && !exitInFootprint && !mouthExteriorIndices.has(idx)) isBad = true;
        ctx.fillStyle = isBad ? C.beltBad : turn === "left" ? C.beltLeft : turn === "right" ? C.beltRight : C.beltStraight;
        ctx.fillRect(r.x, r.y, r.s - gap, r.s - gap);
        // Vector Arrow Drawing - scaled to fit perfectly within the cell padding
        const s = r.s - gap;
        const pad = s * 0.22;
        const cx = r.x + s * 0.5;
        const cy = r.y + s * 0.5;
        // Side anchor points slightly inset from the edges
        const getAnchor = (side) => {
            if (side === 0) return { x: cx, y: r.y + pad };
            if (side === 1) return { x: r.x + s - pad, y: cy };
            if (side === 2) return { x: cx, y: r.y + s - pad };
            return { x: r.x + pad, y: cy };
        };
        const startPt = getAnchor(entrySide);
        const endPt = getAnchor(exitSide);
        const angles = [-Math.PI / 2, 0, Math.PI / 2, Math.PI];
        const angle = angles[exitSide];
        const arrowSize = Math.max(3, s * 0.2);
        const leftWingX = endPt.x + arrowSize * Math.cos(angle + Math.PI - 0.5);
        const leftWingY = endPt.y + arrowSize * Math.sin(angle + Math.PI - 0.5);
        const rightWingX = endPt.x + arrowSize * Math.cos(angle + Math.PI + 0.5);
        const rightWingY = endPt.y + arrowSize * Math.sin(angle + Math.PI + 0.5);
        const drawArrowPath = () => {
            ctx.beginPath();
            ctx.moveTo(startPt.x, startPt.y);
            if (turn) {
                ctx.lineTo(cx, cy);
                ctx.lineTo(endPt.x, endPt.y);
            } else ctx.lineTo(endPt.x, endPt.y);
            ctx.moveTo(leftWingX, leftWingY);
            ctx.lineTo(endPt.x, endPt.y);
            ctx.lineTo(rightWingX, rightWingY);
        };
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        // Double stroke outline: thick black line underneath
        ctx.strokeStyle = "#000000";
        ctx.lineWidth = Math.max(3.5, s * 0.16);
        drawArrowPath();
        ctx.stroke();
        // Inner clean line: thinner white line on top
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = Math.max(1.5, s * 0.08);
        drawArrowPath();
        ctx.stroke();
    }
}
export function suggestedPxPerCell(playAreaCols) {
    return autoPxPerCell(playAreaCols, playAreaCols);
}
export function layoutStats(preview) {
    const { grid, layout, navWalkableIndex, playableBounds, beltPlan } = preview;
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
    if (beltPlan)
        for (let i = 0; i < beltPlan.floorBelts.length; i++)
            if (floorBeltElbowTurn(beltPlan.floorBelts[i].kind)) elbowCount++;
            else straightCount++;
    return {
        seed: layout.mapSeed,
        playArea: `${boundsCols}×${boundsRows}`,
        voxelCells,
        openCells,
        railEdges: layout.rails.length,
        navWalkable: countNavWalkableFlags(navWalkableIndex.flags),
        beltCells: beltPlan?.floorBelts.length ?? 0,
        beltStraight: straightCount,
        beltElbows: elbowCount,
        beltPaths: beltPlan?.pathCount ?? 0,
        beltValid: beltPlan?.validation?.ok ?? null,
        beltError: beltPlan?.validation?.error ?? null,
    };
}
