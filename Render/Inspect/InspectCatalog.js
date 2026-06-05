/** @typedef {import("../../Entities/Pickup.js").Pickup} Pickup */

import { JACKO_CAN } from "../../Config/props/JackoCan.js";
import { WOOD_CRATE } from "../../Config/props/Crate.js";
import { createLabeledCanInspect } from "./factories/LabeledCanInspect.js";
import { createLabeledBoxInspect } from "./factories/LabeledBoxInspect.js";
import { buildJackoInspectMesh } from "./recipes/jacko/InspectMesh.js";
import { buildCrateInspectMesh } from "./recipes/crate/InspectMesh.js";
import { getCrateFaceLabelSrc } from "./recipes/crate/Label.js";

/**
 * @typedef {Object} InspectEntry
 * @property {string} title - Panel header text
 * @property {(ctx: CanvasRenderingContext2D, cx: number, cy: number, scale: number, yaw: number, pitch: number, pickup: Pickup) => void} draw
 * @property {(fn: () => void) => void} [onReady] - Re-render when async assets finish loading
 * @property {() => void} [preload] - Kick off asset preload at startup
 * @property {(pickup: Pickup) => number} [getInitialYaw]
 * @property {(pickup: Pickup) => number} [getInitialPitch]
 * @property {number} [tapPadding] - Extra tap radius beyond pickup.radius (default 14)
 */

/** @type {Record<string, InspectEntry>} */
const INSPECT_ENTRIES = {
    jacko_can: {
        title: "VOLATILE FLUID",
        tapPadding: 14,
        ...withInspectDefaults(createLabeledCanInspect(JACKO_CAN, buildJackoInspectMesh)),
    },
    wood_crate: {
        title: "SHIPPING CRATE",
        tapPadding: 14,
        ...withInspectDefaults(createLabeledBoxInspect(WOOD_CRATE, buildCrateInspectMesh, getCrateFaceLabelSrc)),
    },
};

function withInspectDefaults(recipe) {
    return {
        preload: recipe.preload,
        onReady: recipe.onReady,
        getInitialYaw: recipe.getInitialYaw ?? ((pickup) => pickup.facing ?? 0),
        getInitialPitch: recipe.getInitialPitch ?? (() => 0.2),
        draw: recipe.draw,
    };
}

export function getInspectEntry(inspectKey) {
    if (!inspectKey) return null;
    return INSPECT_ENTRIES[inspectKey] ?? null;
}

export function getPickupInspectEntry(pickup) {
    if (!pickup || pickup.isDead) return null;
    return getInspectEntry(pickup.strategy?.inspectKey);
}

export function preloadAllInspectAssets() {
    for (const entry of Object.values(INSPECT_ENTRIES)) {
        entry.preload?.();
    }
}

/**
 * Find the nearest tap-hit pickup that has a registered inspect entry.
 */
export function findInspectablePickup(state, worldX, worldY, { allowedInspectKeys = null } = {}) {
    if (!state.pickups) return null;

    let best = null;
    let bestDistSq = Infinity;

    for (const pickup of state.pickups) {
        const inspectKey = pickup.strategy?.inspectKey;
        if (allowedInspectKeys && !allowedInspectKeys.includes(inspectKey)) continue;

        const entry = getPickupInspectEntry(pickup);
        if (!entry) continue;

        const tapRadius = pickup.radius + (entry.tapPadding ?? 14);
        const distSq = (pickup.x - worldX) ** 2 + (pickup.y - worldY) ** 2;
        if (distSq <= tapRadius * tapRadius && distSq < bestDistSq) {
            best = pickup;
            bestDistSq = distSq;
        }
    }

    return best;
}
