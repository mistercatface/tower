import { createRectGroundZone } from "../../../Libraries/Spatial/zones/groundZone.js";
/** @param {import("../index.js").TileLabGameState} state */
export function resetTilelabGroundZones(state) {
    const origin = state.getMapSpawnOrigin();
    state.groundZones = [createRectGroundZone(origin.x, origin.y, 80, 80, { id: "tilelab:debug" })];
}
