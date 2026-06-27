import { listShippedSurfaceProfileIds } from "../../Config/procedural/profiles.js";
import { colRowToIndex } from "../Spatial/grid/GridUtils.js";
import { surfaceProfileDefaults, surfaceProfileKnown } from "../Procedural/SurfaceProfileProvider.js";
import { appendSelectField } from "../UI/paramFields.js";
import { getRoomGraph, getRoomLink, pickRoomNodeAt } from "./roomGraphStore.js";
/** @param {string | null | undefined} value @returns {string | null} */
export function normalizeAuthoredSurfaceProfileId(value) {
    if (value == null || value === "") return null;
    const id = String(value);
    if (!surfaceProfileKnown(id)) return null;
    return id;
}
export function surfaceProfileSelectOptions() {
    const defaultId = surfaceProfileDefaults.defaultId;
    return [{ value: "", label: `(default: ${defaultId})` }, ...listShippedSurfaceProfileIds().map((id) => ({ value: id, label: id }))];
}
/** @param {HTMLElement} body @param {string} label @param {string | null | undefined} value @param {(profileId: string | null) => void} onChange */
export function appendSurfaceProfileField(body, label, value, onChange) {
    appendSelectField(body, label, { value: value ?? "", options: surfaceProfileSelectOptions(), onChange: (next) => onChange(normalizeAuthoredSurfaceProfileId(next)) });
}
/** @param {object} state @param {number} col @param {number} row @returns {string | null} */
export function resolveRoomGraphFloorProfileIdAtCell(state, col, row) {
    const node = pickRoomNodeAt(state, col, row);
    if (node?.surfaceProfileId) return node.surfaceProfileId;
    const corridors = getRoomGraph(state).bakedCorridorFloorCells;
    if (!corridors?.length) return null;
    const grid = state.obstacleGrid;
    const idx = colRowToIndex(col, row, grid.cols);
    for (let i = 0; i < corridors.length; i++) {
        const entry = corridors[i];
        if (!entry.cellIndices.includes(idx)) continue;
        const link = getRoomLink(state, entry.linkId);
        if (link?.surfaceProfileId) return link.surfaceProfileId;
    }
    return null;
}
export function resolveWallSurfaceProfileIdAtCell(state, col, row) {
    return resolveRoomGraphFloorProfileIdAtCell(state, col, row) ?? state.worldSurfaces?.surfaceProfileOverride ?? surfaceProfileDefaults.defaultId;
}
