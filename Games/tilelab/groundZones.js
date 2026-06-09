import { createCircleGroundZone, createRectGroundZone, drawGroundZone, processGroundZones } from "../../Libraries/Spatial/zones/groundZones.js";
/** @param {import("./index.js").TileLabGameState} state */
export function resetTilelabGroundZones(state) {
    const origin = state.getMapSpawnOrigin();
    state.groundZones = [createRectGroundZone(origin.x, origin.y, 80, 80, { id: "tilelab:debug-rect" }), createCircleGroundZone(origin.x + 140, origin.y, 70, { id: "tilelab:debug-circle" })];
}
export const tilelabGroundZonePhase = {
    id: "groundZone",
    run(ctx, _dt, runtime) {
        processGroundZones(runtime.spatialFrame, ctx.state.groundZones);
    },
};
/** @type {import("../../Core/GameDefinitionTypes.js").SimulationEffectPass} */
export const tilelabGroundZoneEffectPass = {
    zIndex: 12,
    draw(state, _viewport, ctx) {
        const zones = state.groundZones;
        if (!zones?.length) return;
        ctx.save();
        for (let z = 0; z < zones.length; z++) drawGroundZone(ctx, zones[z]);
        ctx.restore();
    },
};
