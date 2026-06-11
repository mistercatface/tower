import { drawGroundZone, isGroundZoneInView, processGroundZones } from "../../Libraries/Spatial/zones/groundZones.js";
import { NEIGHBOR_QUERY_PAD } from "../../Libraries/Spatial/collision/entityBroadphase.js";
import { wakePushableBody } from "../../Libraries/Motion/pushableSleep.js";
/** @param {import("./state.js").TileLabGameState} state */
export function ensureSandboxGravityZones(state) {
    for (let i = 0; i < state.sandboxGravityZones.length; i++) {
        const zone = state.sandboxGravityZones[i];
        if (zone.kind !== "gravity") continue;
        const pad = NEIGHBOR_QUERY_PAD;
        // Assume rect shape
        const shape = zone.getShape();
        if (shape.type === "Polygon") {
            // Find half extents from vertices (0 is -hx, -hy)
            const hx = Math.abs(shape.vertices[0].x);
            const hy = Math.abs(shape.vertices[0].y);
            zone.aabb = { minX: zone.x - hx - pad, minY: zone.y - hy - pad, maxX: zone.x + hx + pad, maxY: zone.y + hy + pad };
        }
    }
}
/**
 * @param {import("./state.js").TileLabGameState} state
 * @param {import("../../Libraries/Spatial/world/SpatialFrameCore.js").SpatialFrameCore} spatialFrame
 * @param {number} dt
 */
export function tickSandboxGravityZones(state, spatialFrame, dt) {
    ensureSandboxGravityZones(state);
    const zones = state.sandboxGravityZones;
    if (!zones.length) return;
    const dtSec = dt / 1000;
    // Process zones to update _occupants via SAT
    processGroundZones(spatialFrame, zones, { onEnter() {}, onExit() {} });
    // Apply continuous gravity forces
    for (let z = 0; z < zones.length; z++) {
        const zone = zones[z];
        const forceX = zone.forceX ?? 0;
        const forceY = zone.forceY ?? 1000;
        if (forceX === 0 && forceY === 0) continue;
        for (const entityId of zone._occupants) {
            const pickup = state.pickups.find((p) => p.id === entityId);
            if (!pickup || pickup.isDead) continue;
            wakePushableBody(pickup);
            if (pickup.isSleeping) continue;
            pickup.vx += forceX * dtSec;
            pickup.vy += forceY * dtSec;
        }
    }
}
/** @type {import("../../Core/GameDefinitionTypes.js").SimulationEffectPass} */
export const sandboxGravityZoneEffectPass = {
    zIndex: 10,
    draw(state, viewport, ctx) {
        const zones = state.sandboxGravityZones;
        if (!zones?.length) return;
        ctx.save();
        for (let z = 0; z < zones.length; z++) {
            const zone = zones[z];
            if (!isGroundZoneInView(zone, viewport)) continue;
            // Faint visual for debugging/playfield indication
            drawGroundZone(ctx, zone, { fill: "rgba(255, 100, 100, 0.05)", stroke: "rgba(255, 100, 100, 0.2)", lineWidth: 1 });
        }
        ctx.restore();
    },
};
