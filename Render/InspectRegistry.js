/** @typedef {import("../Entities/Pickup.js").Pickup} Pickup */

/**
 * @typedef {Object} PropInspectDescriptor
 * @property {string} title - Panel header text
 * @property {(ctx: CanvasRenderingContext2D, cx: number, cy: number, scale: number, yaw: number, pitch: number, pickup: Pickup) => void} draw
 * @property {(fn: () => void) => void} [onReady] - Re-render when async assets finish loading
 * @property {() => void} [preload] - Kick off asset preload at startup
 * @property {(pickup: Pickup) => number} [getInitialYaw]
 * @property {(pickup: Pickup) => number} [getInitialPitch]
 * @property {number} [tapPadding] - Extra tap radius beyond pickup.radius (default 14)
 */

/** @type {Map<string, PropInspectDescriptor>} */
const registry = new Map();

/** Register an inspect view for a pickup type (e.g. "barrel"). */
export function registerPropInspect(pickupType, descriptor) {
    registry.set(pickupType, descriptor);
}

export function getPropInspect(pickupType) {
    return registry.get(pickupType) ?? null;
}

export function resolvePickupInspect(pickup) {
    if (!pickup || pickup.isDead) return null;
    return registry.get(pickup.type) ?? null;
}

export function preloadAllInspectAssets() {
    for (const descriptor of registry.values()) {
        descriptor.preload?.();
    }
}

/**
 * Find the nearest tap-hit pickup that has a registered inspect descriptor.
 */
export function findInspectablePickup(state, worldX, worldY) {
    if (!state.pickups) return null;

    let best = null;
    let bestDistSq = Infinity;

    for (const pickup of state.pickups) {
        const descriptor = resolvePickupInspect(pickup);
        if (!descriptor) continue;

        const tapRadius = pickup.radius + (descriptor.tapPadding ?? 14);
        const distSq = (pickup.x - worldX) ** 2 + (pickup.y - worldY) ** 2;
        if (distSq <= tapRadius * tapRadius && distSq < bestDistSq) {
            best = pickup;
            bestDistSq = distSq;
        }
    }

    return best;
}
