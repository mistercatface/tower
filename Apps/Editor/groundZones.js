import { drawGroundZone, isGroundZoneInView, processGroundZones } from "../../Libraries/Spatial/zones/groundZones.js";
/** @param {import("./state.js").TileLabGameState} state @param {object} spatialFrame */
export function tickTilelabGroundZones(state, spatialFrame) {
    processGroundZones(spatialFrame, state.groundZones);
}
/** @type {import("../../Core/GameDefinitionTypes.js").SimulationEffectPass} */
export const tilelabGroundZoneEffectPass = {
    zIndex: 12,
    draw(state, viewport, ctx) {
        const zones = state.groundZones;
        ctx.save();
        for (let z = 0; z < zones.length; z++) {
            if (!isGroundZoneInView(zones[z], viewport)) continue;
            drawGroundZone(ctx, zones[z]);
        }
        ctx.restore();
    },
};
