import { listShippedSurfaceProfileIds } from "../../Config/procedural/profiles.js";
import { getSurfaceProfileProvider } from "../Procedural/SurfaceProfileProvider.js";
import { appendSelectField } from "../UI/paramFields.js";
import { getRoomGraph, getRoomLink, pickRoomNodeAt } from "./roomGraphStore.js";
/** @param {string | null | undefined} value @returns {string | null} */
export function normalizeAuthoredSurfaceProfileId(value) {
    if (value == null || value === "") return null;
    const id = String(value);
    if (!getSurfaceProfileProvider().hasProfile(id)) return null;
    return id;
}
export function surfaceProfileSelectOptions() {
    const defaultId = getSurfaceProfileProvider().defaultId;
    return [{ value: "", label: `(default: ${defaultId})` }, ...listShippedSurfaceProfileIds().map((id) => ({ value: id, label: id }))];
}
/** @param {HTMLElement} body @param {string} label @param {string | null | undefined} value @param {(profileId: string | null) => void} onChange */
export function appendSurfaceProfileField(body, label, value, onChange) {
    appendSelectField(body, label, {
        value: value ?? "",
        options: surfaceProfileSelectOptions(),
        onChange: (next) => onChange(normalizeAuthoredSurfaceProfileId(next)),
    });
}
/** @param {object} state @param {number} col @param {number} row @returns {string | null} */
export function resolveRoomGraphFloorProfileIdAtCell(state, col, row) {
    const node = pickRoomNodeAt(state, col, row);
    if (node?.surfaceProfileId) return node.surfaceProfileId;
    const corridors = getRoomGraph(state).bakedCorridorFloorCells;
    if (!corridors?.length) return null;
    const key = `${col},${row}`;
    for (let i = 0; i < corridors.length; i++) {
        const entry = corridors[i];
        if (!entry.cellKeys.includes(key)) continue;
        const link = getRoomLink(state, entry.linkId);
        if (link?.surfaceProfileId) return link.surfaceProfileId;
    }
    return null;
}
/** @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid @param {import("./roomGraphStore.js").RoomNode} node */
export function roomNodeWorldAabb(grid, node) {
    const half = grid.cellHalfSize;
    const w0 = grid.gridToWorld(node.col, node.row);
    const w1 = grid.gridToWorld(node.col + node.width - 1, node.row + node.height - 1);
    return { minX: w0.x - half, minY: w0.y - half, maxX: w1.x + half, maxY: w1.y + half };
}
/** @param {object} state @param {import("./roomGraphStore.js").RoomNode} node */
export function invalidateRoomNodeFloorSurface(state, node) {
    if (!node) return;
    state.worldSurfaces?.surfaceCache?.deleteByPrefix(`roomFloor:${node.id}:`);
}
/** @param {object} state @param {number} linkId */
export function invalidateRoomLinkFloorSurface(state, linkId) {
    state.worldSurfaces?.surfaceCache?.deleteByPrefix(`corridorFloorDraw:${linkId}:`);
    state.worldSurfaces?.surfaceCache?.deleteByPrefix(`corridorFloorMask:${linkId}:`);
}
/** @param {object} state */
export function invalidateAllCorridorFloorSurfaces(state) {
    const cache = state.worldSurfaces?.surfaceCache;
    if (!cache) return;
    cache.deleteByPrefix("corridorFloorDraw:");
    cache.deleteByPrefix("corridorFloorMask:");
}
