/** @typedef {import("../../Entities/Pickup.js").Pickup} Pickup */
/** @typedef {import("../../Libraries/Inspect/InspectCatalog.js").InspectSubject} InspectSubject */
import { getInspectEntry } from "../../Libraries/Inspect/InspectCatalog.js";
/**
 * @param {Pickup} pickup
 * @returns {InspectSubject}
 */
export function toInspectSubject(pickup) {
    return { inspectKey: pickup.strategy?.inspectKey ?? null, isDead: Boolean(pickup.isDead), facing: pickup.facing ?? 0, faceLabelVariants: pickup.faceLabelVariants };
}
/**
 * Find the nearest tap-hit pickup that has a registered inspect entry.
 *
 * @param {{ pickups?: Pickup[] }} state
 */
export function findInspectablePickup(state, worldX, worldY, { allowedInspectKeys = null } = {}) {
    if (!state.pickups) return null;
    let best = null;
    let bestDistSq = Infinity;
    for (const pickup of state.pickups) {
        const inspectKey = pickup.strategy?.inspectKey;
        if (allowedInspectKeys && !allowedInspectKeys.includes(inspectKey)) continue;
        const entry = getInspectEntry(inspectKey);
        if (!entry || pickup.isDead) continue;
        const tapRadius = pickup.radius + (entry.tapPadding ?? 14);
        const distSq = (pickup.x - worldX) ** 2 + (pickup.y - worldY) ** 2;
        if (distSq <= tapRadius * tapRadius && distSq < bestDistSq) {
            best = pickup;
            bestDistSq = distSq;
        }
    }
    return best;
}
