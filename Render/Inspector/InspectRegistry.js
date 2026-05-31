/** @typedef {import("../../Entities/Pickup.js").Pickup} Pickup */

import { propInspectDefinitions } from "../../Config/PropInspectDefinitions.js";
import { getPropInspectRecipe } from "../3D/PropInspectRecipes.js";

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

/** @type {Map<string, PropInspectDescriptor|null>} */
const descriptorCache = new Map();

function buildDescriptor(inspectKey) {
    const meta = propInspectDefinitions[inspectKey];
    const recipe = getPropInspectRecipe(inspectKey);
    if (!meta || !recipe) return null;

    return {
        title: meta.title,
        tapPadding: meta.tapPadding,
        preload: recipe.preload,
        onReady: recipe.onReady,
        getInitialYaw: recipe.getInitialYaw ?? ((pickup) => pickup.facing ?? 0),
        getInitialPitch: recipe.getInitialPitch ?? (() => 0.2),
        draw: recipe.draw,
    };
}

function getDescriptorForInspectKey(inspectKey) {
    if (!inspectKey) return null;
    if (!descriptorCache.has(inspectKey)) {
        descriptorCache.set(inspectKey, buildDescriptor(inspectKey));
    }
    return descriptorCache.get(inspectKey);
}

export function resolvePickupInspect(pickup) {
    if (!pickup || pickup.isDead) return null;
    return getDescriptorForInspectKey(pickup.strategy?.inspectKey);
}

/**
 * Find the nearest tap-hit pickup that has a registered inspect descriptor.
 */
export function findInspectablePickup(state, worldX, worldY, { allowedInspectKeys = null } = {}) {
    if (!state.pickups) return null;

    let best = null;
    let bestDistSq = Infinity;

    for (const pickup of state.pickups) {
        const inspectKey = pickup.strategy?.inspectKey;
        if (allowedInspectKeys && !allowedInspectKeys.includes(inspectKey)) continue;

        const descriptor = pickup.resolveInspect();
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
