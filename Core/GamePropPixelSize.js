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
/** @returns {number | null} */
export function getActivePropPixelSize() {
    return activePropPixelSize;
}
/** @param {object} [prop] */
export function hasEntityPropPixelSize(prop) {
    const value = prop?.strategy?.propPixelSize;
    return typeof value === "number" && value > 0;
}
/** Entity `strategy.propPixelSize` is the bake diameter; game default floors at world size. */
export function resolvePropPixelSizeForProp(prop) {
    if (hasEntityPropPixelSize(prop)) return prop.strategy.propPixelSize;
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
    clearPropSpriteCache();
}
/**
 * @param {number} worldDiameter — full prop extent in world units (max of width/height)
 * @param {number | null} [pixelSize]
 * @param {boolean} [entityOverride] — per-prop bake diameter (no world-size floor)
 */
export function resolvePropBakeScale(worldDiameter, pixelSize = activePropPixelSize, entityOverride = false) {
    if (!pixelSize || worldDiameter <= 0) return 1;
    const bakeDiameter = entityOverride ? pixelSize : Math.max(pixelSize, worldDiameter);
    return bakeDiameter / worldDiameter;
}
/** @param {object} prop */
export function resolvePropBakeScaleForProp(prop, worldDiameter) {
    const pixelSize = resolvePropPixelSizeForProp(prop);
    return resolvePropBakeScale(worldDiameter, pixelSize, hasEntityPropPixelSize(prop));
}
