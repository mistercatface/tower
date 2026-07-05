import { clearPropSpriteCache } from "../Libraries/Canvas/QuantizedSpriteCache.js";
import { LIBRARY_DEFAULT_BAKE_PIXEL_SIZE } from "../Libraries/Physics/physicsDefaults.js";
/**
 * Internal bake diameter for radial-elevation props. Target `propPixelSize` applies to small props;
 * larger props automatically bake at full world diameter so nothing is upscaled on blit.
 *
 * @typedef {object} PropPixelSizeConfig
 * @property {number | null} [propPixelSize] — target bake diameter for small props; null = 1:1 world bake
 */
export const defaultPropPixelSize = LIBRARY_DEFAULT_BAKE_PIXEL_SIZE;
export let propPixelSize = null;
export function setPropPixelSize(value) {
    propPixelSize = value;
}
/** @param {object} [prop] */
export function hasEntityPropPixelSize(prop) {
    const value = prop?.strategy?.propPixelSize;
    return typeof value === "number" && value > 0;
}
/** Entity `strategy.propPixelSize` is the bake diameter; game default floors at world size. */
export function resolvePropPixelSizeForProp(prop) {
    if (hasEntityPropPixelSize(prop)) return prop.strategy.propPixelSize;
    return propPixelSize;
}
/** @param {import("./GameDefinitionTypes.js").EngineProfile | null | undefined} definition */
export function resolvePropPixelSize(definition) {
    const value = definition?.propPixelSize;
    if (typeof value === "number" && value > 0) return value;
    return defaultPropPixelSize;
}
/** Quantize zoom for prop bake cache keys — eighth-step buckets. */
export function quantizePropBakeZoom(zoom) {
    if (!Number.isFinite(zoom) || zoom <= 0) return 1;
    return Math.max(0.25, Math.round(zoom * 8) / 8);
}
/**
 * @param {number} worldDiameter — full prop extent in world units (max of width/height)
 * @param {number | null} [pixelSize]
 * @param {boolean} [entityOverride] — per-prop bake diameter (no world-size floor)
 * @param {number} [zoom] — viewport zoom so bake density tracks on-screen size
 */
export function resolvePropBakeScale(worldDiameter, pixelSize = propPixelSize, entityOverride = false, zoom = 1) {
    if (!pixelSize || worldDiameter <= 0) return 1;
    const viewZoom = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
    const screenDiameter = worldDiameter * viewZoom;
    const bakeDiameter = entityOverride ? Math.max(pixelSize, screenDiameter) : Math.max(pixelSize, screenDiameter, worldDiameter);
    return bakeDiameter / worldDiameter;
}
/** @param {object} prop @param {number} worldDiameter @param {number} [zoom] */
export function resolvePropBakeScaleForProp(prop, worldDiameter, zoom = 1) {
    const pixelSize = resolvePropPixelSizeForProp(prop);
    return resolvePropBakeScale(worldDiameter, pixelSize, hasEntityPropPixelSize(prop), zoom);
}
