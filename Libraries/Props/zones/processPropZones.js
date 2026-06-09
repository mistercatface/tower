import { getPropAsset } from "../PropCatalog.js";
import { getZoneHandler, isInZone, isZoneVictim } from "./zoneHandlers.js";

/**
 * @param {object} state
 * @param {number} dt
 */
export function processPropZones(state, _dt) {
    const pickups = state.pickups;
    if (!pickups?.length) return;
    /** @type {object[]} */
    const emitters = [];
    for (let i = 0; i < pickups.length; i++) {
        const pickup = pickups[i];
        if (pickup.isDead) continue;
        if (getPropAsset(pickup.type)?.zone) emitters.push(pickup);
    }
    if (emitters.length === 0) return;
    for (let e = 0; e < emitters.length; e++) {
        const emitter = emitters[e];
        const zone = getPropAsset(emitter.type).zone;
        const handler = getZoneHandler(zone.kind);
        if (!handler?.onEnter) continue;
        for (let v = 0; v < pickups.length; v++) {
            const victim = pickups[v];
            if (!isZoneVictim(victim)) continue;
            if (!isInZone(victim, emitter, zone)) continue;
            handler.onEnter(victim, emitter, zone, state);
        }
    }
}
