import { pickupStates } from "../../Entities/PickupStates.js";
import { voidSinkPickupStates } from "../../Entities/pickupVoidSinkState.js";
import { processGroundZones, isGroundZoneInView } from "../../Libraries/Spatial/zones/groundZones.js";
import { createVoidZone, drawVoidZone, isInsideVoidMouth, voidMouthReach } from "../../Libraries/Spatial/zones/voidZone.js";
import { NEIGHBOR_QUERY_PAD } from "../../Libraries/Spatial/collision/entityBroadphase.js";
/** @param {import("./state.js").TileLabGameState} state */
export function ensureSandboxVoidZones(state) {
    for (let i = 0; i < state.sandboxVoidZones.length; i++) {
        const zone = state.sandboxVoidZones[i];
        if (zone.kind !== "void") continue;
        const radius = zone.shape.radius;
        const pad = NEIGHBOR_QUERY_PAD;
        zone.aabb = { minX: zone.x - radius - pad, minY: zone.y - radius - pad, maxX: zone.x + radius + pad, maxY: zone.y + radius + pad };
    }
}
export function registerSandboxVoidPickupStates() {
    Object.assign(pickupStates, voidSinkPickupStates);
}
export function unregisterSandboxVoidPickupStates() {
    delete pickupStates.voidSink;
}
/** @param {object} pickup @param {ReturnType<typeof createVoidZone>} zone */
function beginVoidSink(pickup, zone) {
    if (pickup.isDead || pickup.currentStateName === "voidSink") return;
    if (typeof pickup.getShape !== "function") return;
    pickup.voidX = zone.x;
    pickup.voidY = zone.y;
    pickup.voidRadius = zone.shape.radius;
    pickup.voidDepth = zone.depth;
    pickup.voidSinkTimer = 1500;
    pickup.voidCaptured = Math.hypot(zone.x - pickup.x, zone.y - pickup.y) <= voidMouthReach(zone.shape.radius, pickup) * 0.65;
    pickup.changeState("voidSink");
}
/** @param {import("./state.js").TileLabGameState} state @param {number} entityId @param {ReturnType<typeof createVoidZone>} zone */
function rimOutVoidSink(state, entityId, zone) {
    const pickup = state.pickups.find((p) => p.id === entityId);
    if (!pickup || pickup.currentStateName !== "voidSink" || pickup.voidCaptured) return;
    if (isInsideVoidMouth(zone.x, zone.y, zone.shape.radius, pickup)) return;
    pickup.changeState("normal");
}
export const sandboxVoidZonePhase = {
    id: "sandboxVoidZone",
    run(ctx, _dt, runtime) {
        ensureSandboxVoidZones(ctx.state);
        const zones = ctx.state.sandboxVoidZones;
        if (!zones.length) return;
        processGroundZones(runtime.spatialFrame, zones, {
            onEnter(zone, entity) {
                beginVoidSink(entity, zone);
            },
            onExit(zone, entityId) {
                rimOutVoidSink(ctx.state, entityId, zone);
            },
        });
    },
};
/** @type {import("../../Core/GameDefinitionTypes.js").SimulationEffectPass} */
export const sandboxVoidZoneEffectPass = {
    zIndex: 11,
    draw(state, viewport, ctx) {
        const zones = state.sandboxVoidZones;
        ctx.save();
        for (let z = 0; z < zones.length; z++) {
            const zone = zones[z];
            if (!isGroundZoneInView(zone, viewport)) continue;
            drawVoidZone(ctx, zone, viewport.x, viewport.y);
        }
        ctx.restore();
    },
};
