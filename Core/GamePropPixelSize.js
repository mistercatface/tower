import { clearPropSpriteCache } from "../Libraries/Canvas/QuantizedSpriteCache.js";
import { LIBRARY_KINEMATICS_PIXEL_SIZE } from "../Libraries/Motion/bodyDefaults.js";
/**
 * Internal bake diameter for iso props (same role as `kinematicsPixelSize` for actors).
 * Target `propPixelSize` applies to small props; larger props automatically bake at full
 * world diameter so nothing is ever upscaled (blurry) on blit.
 *
 * @typedef {object} PropPixelSizeConfig
 * @property {number | null} [propPixelSize] — target bake diameter for small props; null = 1:1 world bake
 */
/** Default target bake diameter — same convention as actor kinematics. */
export const defaultPropPixelSize = LIBRARY_KINEMATICS_PIXEL_SIZE;
/** @type {number | null} */
let activePropPixelSize = null;
/** @type {boolean} */
let activeForcePropPixelSize = false;
/** @returns {number | null} */
export function getActivePropPixelSize() {
    return activePropPixelSize;
}
/** @param {import("./GameDefinitionTypes.js").GameDefinition | null | undefined} definition */
export function resolvePropPixelSize(definition) {
    const value = definition?.propPixelSize;
    if (typeof value === "number" && value > 0) return value;
    return defaultPropPixelSize;
}
/** @param {import("./GameDefinitionTypes.js").GameDefinition} definition */
export function applyGamePropPixelSize(definition) {
    activePropPixelSize = resolvePropPixelSize(definition);
    activeForcePropPixelSize = !!definition?.forcePropPixelSize;
    clearPropSpriteCache();
}
/**
 * Bake scale for a prop given its world-space extent.
 * bakeScale is always >= 1 when pixelSize is set — downscale or 1:1 only, never upscale.
 *
 * @param {number} worldDiameter — full prop extent in world units (max of width/height)
 * @param {number | null} [pixelSize]
 */
export function resolvePropBakeScale(worldDiameter, pixelSize = activePropPixelSize) {
    if (!pixelSize || worldDiameter <= 0) return 1;
    const bakeDiameter = activeForcePropPixelSize ? pixelSize : Math.max(pixelSize, worldDiameter);
    return bakeDiameter / worldDiameter;
}
