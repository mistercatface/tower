import { drawGroundZone, isGroundZoneInView, processGroundZones } from "../../Libraries/Spatial/zones/groundZones.js";
export const tilelabGroundZonePhase = {
    id: "groundZone",
    run(ctx, _dt, runtime) {
        processGroundZones(runtime.spatialFrame, ctx.state.groundZones);
    },
};
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
