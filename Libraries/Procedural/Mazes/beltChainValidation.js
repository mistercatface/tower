import { floorBeltEntryExitSides } from "../../Spatial/grid/FloorCell.js";
import { CARDINAL_OFFSETS, gridCellKey } from "../../Spatial/grid/GridUtils.js";
function neighborForSide(col, row, side) {
    const off = CARDINAL_OFFSETS[side];
    return { col: col + off.dc, row: row + off.dr };
}
function oppositeSide(side) {
    return (side + 2) % 4;
}
export function beltFootprintKeys(belts) {
    const footprint = new Set();
    for (let i = 0; i < belts.length; i++) footprint.add(gridCellKey(belts[i].col, belts[i].row));
    return footprint;
}
export function beltMapFromFloorBelts(belts) {
    const map = new Map();
    for (let i = 0; i < belts.length; i++) {
        const belt = belts[i];
        map.set(gridCellKey(belt.col, belt.row), belt);
    }
    return map;
}
export function assertBeltChains(footprint, beltsByCell, label, mouthExteriorKeys = new Set()) {
    for (const key of footprint) if (!beltsByCell.get(key)) throw new Error(`${label}: missing belt at ${key}`);
    for (const key of footprint) {
        const belt = beltsByCell.get(key);
        const { entrySide, exitSide } = floorBeltEntryExitSides(belt.kind, belt.facingIndex);
        const entry = neighborForSide(belt.col, belt.row, entrySide);
        const exit = neighborForSide(belt.col, belt.row, exitSide);
        const entryKey = gridCellKey(entry.col, entry.row);
        const exitKey = gridCellKey(exit.col, exit.row);
        const entryInFootprint = footprint.has(entryKey);
        const exitInFootprint = footprint.has(exitKey);
        if (entryInFootprint) {
            const entryBelt = beltsByCell.get(entryKey);
            const entryExit = floorBeltEntryExitSides(entryBelt.kind, entryBelt.facingIndex).exitSide;
            if (entryExit !== oppositeSide(entrySide)) throw new Error(`${label}: belt chain break ${entryKey} -> ${key} (entry side ${entrySide}, upstream exit ${entryExit})`);
        }
        if (exitInFootprint) {
            const exitBelt = beltsByCell.get(exitKey);
            const exitEntry = floorBeltEntryExitSides(exitBelt.kind, exitBelt.facingIndex).entrySide;
            if (exitEntry !== oppositeSide(exitSide)) throw new Error(`${label}: belt chain break ${key} -> ${exitKey} (exit side ${exitSide}, downstream entry ${exitEntry})`);
        }
        if (!entryInFootprint && !exitInFootprint && !mouthExteriorKeys.has(key)) throw new Error(`${label}: dead-end belt at ${key}`);
    }
}
export function validateBeltChains(belts, mouthExteriorKeys = new Set()) {
    const footprint = beltFootprintKeys(belts);
    const beltsByCell = beltMapFromFloorBelts(belts);
    assertBeltChains(footprint, beltsByCell, "belt plan", mouthExteriorKeys);
    return { ok: true, footprint, beltsByCell };
}
export function tryValidateBeltChains(belts, mouthExteriorKeys = new Set()) {
    try {
        return { ...validateBeltChains(belts, mouthExteriorKeys), error: null };
    } catch (err) {
        return { ok: false, error: err.message, footprint: beltFootprintKeys(belts), beltsByCell: beltMapFromFloorBelts(belts) };
    }
}
