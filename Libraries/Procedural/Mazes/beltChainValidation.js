import { floorBeltEntryExitSides } from "../../Spatial/grid/FloorCell.js";
import { CARDINAL_OFFSETS, indexToColRow, layoutCellIndex } from "../../Spatial/grid/GridUtils.js";
function cellIndex(col, row, layout) {
    return layoutCellIndex(col, row, layout.originCol, layout.originRow, layout.strideCols);
}
function neighborForSide(col, row, side) {
    const off = CARDINAL_OFFSETS[side];
    return { col: col + off.dc, row: row + off.dr };
}
function oppositeSide(side) {
    return (side + 2) % 4;
}
/** @param {{ col: number, row: number, kind: number, facingIndex: number }[]} belts @param {import("../../Spatial/grid/GridUtils.js").CellIndexLayout} layout */
export function beltFootprintIndices(belts, layout) {
    const footprint = new Set();
    for (let i = 0; i < belts.length; i++) footprint.add(cellIndex(belts[i].col, belts[i].row, layout));
    return footprint;
}
/** @param {{ col: number, row: number, kind: number, facingIndex: number }[]} belts @param {import("../../Spatial/grid/GridUtils.js").CellIndexLayout} layout */
export function beltMapFromFloorBelts(belts, layout) {
    const map = new Map();
    for (let i = 0; i < belts.length; i++) {
        const belt = belts[i];
        map.set(cellIndex(belt.col, belt.row, layout), belt);
    }
    return map;
}
/** @param {Set<number>} footprint @param {Map<number, { col: number, row: number, kind: number, facingIndex: number }>} beltsByCell @param {import("../../Spatial/grid/GridUtils.js").CellIndexLayout} layout */
function formatCellIdx(idx, layout) {
    const { col, row } = indexToColRow(idx, layout.strideCols);
    return `(${col + layout.originCol},${row + layout.originRow})`;
}
export function assertBeltChains(footprint, beltsByCell, layout, label, mouthExteriorIndices = new Set()) {
    for (const idx of footprint) if (!beltsByCell.get(idx)) throw new Error(`${label}: missing belt at ${formatCellIdx(idx, layout)}`);
    for (const idx of footprint) {
        const belt = beltsByCell.get(idx);
        const { entrySide, exitSide } = floorBeltEntryExitSides(belt.kind, belt.facingIndex);
        const entry = neighborForSide(belt.col, belt.row, entrySide);
        const exit = neighborForSide(belt.col, belt.row, exitSide);
        const entryIdx = cellIndex(entry.col, entry.row, layout);
        const exitIdx = cellIndex(exit.col, exit.row, layout);
        const entryInFootprint = footprint.has(entryIdx);
        const exitInFootprint = footprint.has(exitIdx);
        if (entryInFootprint) {
            const entryBelt = beltsByCell.get(entryIdx);
            const entryExit = floorBeltEntryExitSides(entryBelt.kind, entryBelt.facingIndex).exitSide;
            if (entryExit !== oppositeSide(entrySide))
                throw new Error(`${label}: belt chain break ${formatCellIdx(entryIdx, layout)} -> ${formatCellIdx(idx, layout)} (entry side ${entrySide}, upstream exit ${entryExit})`);
        }
        if (exitInFootprint) {
            const exitBelt = beltsByCell.get(exitIdx);
            const exitEntry = floorBeltEntryExitSides(exitBelt.kind, exitBelt.facingIndex).entrySide;
            if (exitEntry !== oppositeSide(exitSide))
                throw new Error(`${label}: belt chain break ${formatCellIdx(idx, layout)} -> ${formatCellIdx(exitIdx, layout)} (exit side ${exitSide}, downstream entry ${exitEntry})`);
        }
        if (!entryInFootprint && !exitInFootprint && !mouthExteriorIndices.has(idx)) throw new Error(`${label}: dead-end belt at ${formatCellIdx(idx, layout)}`);
    }
}
export function validateBeltChains(belts, layout, mouthExteriorIndices = new Set()) {
    const footprint = beltFootprintIndices(belts, layout);
    const beltsByCell = beltMapFromFloorBelts(belts, layout);
    assertBeltChains(footprint, beltsByCell, layout, "belt plan", mouthExteriorIndices);
    return { ok: true, footprint, beltsByCell };
}
export function tryValidateBeltChains(belts, layout, mouthExteriorIndices = new Set()) {
    try {
        return { ...validateBeltChains(belts, layout, mouthExteriorIndices), error: null };
    } catch (err) {
        return { ok: false, error: err.message, footprint: beltFootprintIndices(belts, layout), beltsByCell: beltMapFromFloorBelts(belts, layout) };
    }
}
