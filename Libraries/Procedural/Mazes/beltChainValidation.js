import { floorBeltEntryExitSides } from "../../Spatial/grid/FloorCell.js";
import { CARDINAL_OFFSETS, layoutAbsCellIndex } from "../../Spatial/grid/GridUtils.js";
import { edgeMirrorSide, edgeNeighborIdx } from "../../Spatial/grid/gridCellTopology.js";
/** @param {{ idx: number, kind: number, facingIndex: number }[]} belts @param {import("../../Spatial/grid/GridUtils.js").CellIndexLayout} layout */
export function beltFootprintIndices(belts, layout) {
    /** @type {Set<import("../../Spatial/grid/GridUtils.js").LayoutCellIdx>} */
    const footprint = new Set();
    for (let i = 0; i < belts.length; i++) footprint.add(belts[i].idx);
    return footprint;
}
/** @param {{ idx: number, kind: number, facingIndex: number }[]} belts @param {import("../../Spatial/grid/GridUtils.js").CellIndexLayout} layout */
export function beltMapFromFloorBelts(belts, layout) {
    /** @type {Map<import("../../Spatial/grid/GridUtils.js").LayoutCellIdx, { idx: number, kind: number, facingIndex: number }>} */
    const map = new Map();
    for (let i = 0; i < belts.length; i++) {
        const belt = belts[i];
        map.set(belt.idx, belt);
    }
    return map;
}
/** Human-readable coords for validation errors only — not a lookup key. */
function formatLayoutCellForError(idx, layout) {
    const row = (idx / layout.strideCols) | 0;
    const col = idx - row * layout.strideCols;
    return `(${col + layout.originCol},${row + layout.originRow})`;
}
/**
 * @param {Set<import("../../Spatial/grid/GridUtils.js").LayoutCellIdx>} footprint
 * @param {Map<import("../../Spatial/grid/GridUtils.js").LayoutCellIdx, { idx: number, kind: number, facingIndex: number }>} beltsByCell
 * @param {import("../../Spatial/grid/GridUtils.js").CellIndexLayout} layout
 * @param {Set<import("../../Spatial/grid/GridUtils.js").LayoutCellIdx>} [mouthExteriorIndices]
 */
export function assertBeltChains(footprint, beltsByCell, layout, label, mouthExteriorIndices = new Set()) {
    const stride = layout.strideCols;
    const rows = layout.cellCount / stride;
    for (const idx of footprint) if (!beltsByCell.get(idx)) throw new Error(`${label}: missing belt at ${formatLayoutCellForError(idx, layout)}`);
    for (const idx of footprint) {
        const belt = beltsByCell.get(idx);
        const { entrySide, exitSide } = floorBeltEntryExitSides(belt.kind, belt.facingIndex);
        const entryIdx = edgeNeighborIdx(belt.idx, entrySide, stride, rows);
        const exitIdx = edgeNeighborIdx(belt.idx, exitSide, stride, rows);
        const entryInFootprint = footprint.has(entryIdx);
        const exitInFootprint = footprint.has(exitIdx);
        if (entryInFootprint) {
            const entryBelt = beltsByCell.get(entryIdx);
            const entryExit = floorBeltEntryExitSides(entryBelt.kind, entryBelt.facingIndex).exitSide;
            if (entryExit !== edgeMirrorSide(entrySide))
                throw new Error(
                    `${label}: belt chain break ${formatLayoutCellForError(entryIdx, layout)} -> ${formatLayoutCellForError(idx, layout)} (entry side ${entrySide}, upstream exit ${entryExit})`,
                );
        }
        if (exitInFootprint) {
            const exitBelt = beltsByCell.get(exitIdx);
            const exitEntry = floorBeltEntryExitSides(exitBelt.kind, exitBelt.facingIndex).entrySide;
            if (exitEntry !== edgeMirrorSide(exitSide))
                throw new Error(
                    `${label}: belt chain break ${formatLayoutCellForError(idx, layout)} -> ${formatLayoutCellForError(exitIdx, layout)} (exit side ${exitSide}, downstream entry ${exitEntry})`,
                );
        }
        if (!entryInFootprint && !exitInFootprint && !mouthExteriorIndices.has(idx)) throw new Error(`${label}: dead-end belt at ${formatLayoutCellForError(idx, layout)}`);
    }
}
/** @param {Set<import("../../Spatial/grid/GridUtils.js").LayoutCellIdx>} [mouthExteriorIndices] */
export function validateBeltChains(belts, layout, mouthExteriorIndices = new Set()) {
    const footprint = beltFootprintIndices(belts, layout);
    const beltsByCell = beltMapFromFloorBelts(belts, layout);
    assertBeltChains(footprint, beltsByCell, layout, "belt plan", mouthExteriorIndices);
    return { ok: true, footprint, beltsByCell };
}
/** @param {Set<import("../../Spatial/grid/GridUtils.js").LayoutCellIdx>} [mouthExteriorIndices] */
export function tryValidateBeltChains(belts, layout, mouthExteriorIndices = new Set()) {
    try {
        return { ...validateBeltChains(belts, layout, mouthExteriorIndices), error: null };
    } catch (err) {
        return { ok: false, error: err.message, footprint: beltFootprintIndices(belts, layout), beltsByCell: beltMapFromFloorBelts(belts, layout) };
    }
}
