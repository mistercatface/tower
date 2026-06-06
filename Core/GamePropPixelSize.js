import { clearPropSpriteCache } from "../Libraries/Canvas/QuantizedSpriteCache.js";

/**
 * Internal bake diameter for iso props (same role as `kinematicsPixelSize` for actors).
 * When set, props render to an offscreen canvas at this pixel diameter, then blit at world size.
 *
 * @typedef {object} PropPixelSizeConfig
 * @property {number | null} [propPixelSize] — target bake diameter in px; null = 1 world unit per px (legacy)
 */

/** @type {number | null} */
let activePropPixelSize = null;

/** @returns {number | null} */
export function getActivePropPixelSize() {
    return activePropPixelSize;
}

/** @param {import("./GameDefinitionTypes.js").GameDefinition | null | undefined} definition */
export function resolvePropPixelSize(definition) {
    const value = definition?.propPixelSize;
    return typeof value === "number" && value > 0 ? value : null;
}

/** @param {import("./GameDefinitionTypes.js").GameDefinition} definition */
export function applyGamePropPixelSize(definition) {
    activePropPixelSize = resolvePropPixelSize(definition);
    clearPropSpriteCache();
}

/**
 * @param {number} worldRadius
 * @param {number | null} [pixelSize]
 */
export function resolvePropBakeScale(worldRadius, pixelSize = activePropPixelSize) {
    if (!pixelSize || worldRadius <= 0) return 1;
    return pixelSize / (worldRadius * 2);
}
