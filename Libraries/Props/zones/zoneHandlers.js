import { getPropAsset } from "../PropCatalog.js";
import { voidZoneHandler } from "./handlers/void.js";

/** @typedef {object} ZoneHandler
 *  @property {(victim: object, emitter: object, zone: object, state: object) => void} [onEnter]
 *  @property {(victim: object, emitter: object | null, effect: object, dt: number, state: object) => void} [tick]
 *  @property {(victim: object, emitter: object | null, effect: object, state: object) => void} [onExit]
 *  @property {(victim: object, emitter: object | null, effect: object, state: object) => void} [onComplete]
 */

/** @type {Record<string, ZoneHandler>} */
export const ZONE_HANDLERS = { void: voidZoneHandler };

/** @param {object} pickup */
export function isZoneVictim(pickup) {
    if (pickup.isDead || pickup.currentStateName === "dead") return false;
    const asset = getPropAsset(pickup.type);
    if (asset?.zone) return false;
    if (asset?.zoneImmune) return false;
    if (pickup.currentStateName === "zoneAffected") return false;
    return true;
}

/**
 * @param {object} victim
 * @param {object} emitter
 * @param {object} zone
 */
export function isInZone(victim, emitter, zone) {
    const radius = zone.radius ?? emitter.radius ?? 8;
    const dx = victim.x - emitter.x;
    const dy = victim.y - emitter.y;
    return dx * dx + dy * dy <= radius * radius;
}

/** @param {string} kind */
export function getZoneHandler(kind) {
    return ZONE_HANDLERS[kind] ?? null;
}
