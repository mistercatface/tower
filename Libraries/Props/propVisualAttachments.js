import { visualOverrideCacheKey } from "../Color/visualOverride.js";
import { quantizeAngle } from "../Math/Angle.js";
import { CircleShape, PolygonShape } from "../Spatial/collision/Shapes.js";
import { rotateXY } from "../Math/Poly2D.js";
import { resolveBodyRadius } from "../Motion/bodyDefaults.js";
import { getPropAsset, getWorldPropDefinitions } from "./PropCatalog.js";
import { initWorldPropShape, propFootprintHalfExtents, resolvePropQuantizeSteps, withPropStrategyDefaults } from "./propStrategy.js";
/**
 * Asset-level fixed child visuals. These are render-only and never become
 * WorldProp entities, collision bodies, exported props, or selectable objects.
 *
 * @typedef {object} PropVisualAttachment
 * @property {string} id Stable attachment id for cache keys.
 * @property {string} propId Child prop asset id to draw.
 * @property {{ x?: number, y?: number }} [offset] Local parent-facing offset.
 * @property {"world" | "parentRadius"} [offsetSpace] Whether offset is world units or parent-radius units.
 * @property {number} [facingOffset] Rotation added to the parent quantized facing.
 * @property {"facing" | "velocity"} [heading] Heading source for offset and rotation.
 * @property {number} [minHeadingSpeed] Minimum speed for velocity heading; below this falls back to facing.
 * @property {number} [scale] Visual scale applied to the child footprint.
 * @property {number} [radiusScale] Child visual radius as a multiplier of parent radius.
 * @property {number} [layer] Negative draws before parent, non-negative after.
 * @property {boolean} [inheritTint] When true, child receives parent visualOverride.
 */
function normalizeAttachmentScale(scale) {
    return Number.isFinite(scale) && scale > 0 ? scale : 1;
}
function resolveAttachmentHeading(prop, cfg) {
    if (cfg.heading === "velocity") {
        const vx = prop.vx ?? 0;
        const vy = prop.vy ?? 0;
        const speed = Math.hypot(vx, vy);
        const minSpeed = cfg.minHeadingSpeed ?? 0.25;
        if (speed >= minSpeed) return Math.atan2(vy, vx);
    }
    return prop.facing ?? 0;
}
function resolveQuantizedAttachmentHeading(prop, cfg) {
    return quantizeAngle(resolveAttachmentHeading(prop, cfg), resolvePropQuantizeSteps(prop).facing);
}
function resolveAttachmentOffsetScale(parentProp, cfg) {
    return cfg.offsetSpace === "parentRadius" ? resolveBodyRadius(parentProp) : 1;
}
function buildVirtualPropStrategy(type) {
    const def = getWorldPropDefinitions()[type];
    if (!def) return null;
    return withPropStrategyDefaults({ ...def });
}
function scaleVirtualPropShape(prop, scale) {
    if (scale === 1) return;
    const shape = prop.getShape?.() ?? prop.shape;
    if (shape?.type === "Circle") {
        prop.shape = new CircleShape(shape.radius * scale);
        prop.radius = prop.shape.radius;
        return;
    }
    if (shape?.type === "Polygon") {
        prop.shape = new PolygonShape(shape.vertices.map((v) => ({ x: v.x * scale, y: v.y * scale })));
        prop.radius = prop.shape.getBoundingRadius();
    }
}
function resolveVirtualPropScale(parentProp, childProp, cfg) {
    const baseScale = normalizeAttachmentScale(cfg.scale);
    if (!Number.isFinite(cfg.radiusScale) || cfg.radiusScale <= 0) return baseScale;
    const footprint = propFootprintHalfExtents(childProp);
    const childRadius = Math.max(resolveBodyRadius(childProp), footprint.x, footprint.y);
    if (childRadius <= 0) return baseScale;
    return baseScale * ((resolveBodyRadius(parentProp) * cfg.radiusScale) / childRadius);
}
/** @param {object} prop */
export function getPropVisualAttachmentConfigs(prop) {
    const attachments = getPropAsset(prop?.type)?.visuals?.attachments;
    return Array.isArray(attachments) ? attachments : [];
}
/** @param {object} prop */
export function hasPropVisualAttachments(prop) {
    return getPropVisualAttachmentConfigs(prop).length > 0;
}
/**
 * @param {object} prop
 * @param {{ quantizeAngleIndex: (angle: number, steps: number) => number }} deps
 */
export function getVisualAttachmentSpriteCacheKey(prop, deps) {
    const attachments = getPropVisualAttachmentConfigs(prop);
    if (!attachments.length) return "";
    const facingSteps = resolvePropQuantizeSteps(prop).facing;
    const parts = [];
    for (let i = 0; i < attachments.length; i++) {
        const cfg = attachments[i];
        if (!cfg?.id || !cfg.propId) continue;
        const headingIndex = deps.quantizeAngleIndex(resolveAttachmentHeading(prop, cfg), facingSteps);
        const offset = cfg.offset ?? {};
        parts.push(
            [
                cfg.id,
                cfg.propId,
                headingIndex,
                Math.round((offset.x ?? 0) * 100) / 100,
                Math.round((offset.y ?? 0) * 100) / 100,
                cfg.offsetSpace ?? "world",
                Math.round((cfg.facingOffset ?? 0) * 10000) / 10000,
                Math.round(normalizeAttachmentScale(cfg.scale) * 100) / 100,
                Math.round((cfg.radiusScale ?? 0) * 100) / 100,
                cfg.heading ?? "facing",
                cfg.layer ?? 0,
                cfg.inheritTint === true ? visualOverrideCacheKey(prop) : "",
            ].join(":"),
        );
    }
    return parts.length ? parts.join("|") : "";
}
function createVirtualAttachmentProp(parentProp, cfg, heading) {
    const childAsset = getPropAsset(cfg.propId);
    const strategy = buildVirtualPropStrategy(cfg.propId);
    if (!childAsset || !strategy) return null;
    const offset = cfg.offset ?? {};
    const offsetScale = resolveAttachmentOffsetScale(parentProp, cfg);
    const localX = (offset.x ?? 0) * offsetScale;
    const localY = (offset.y ?? 0) * offsetScale;
    const rotated = rotateXY(localX, localY, Math.cos(heading), Math.sin(heading));
    const prop = {
        type: cfg.propId,
        strategy,
        x: parentProp.x + rotated.x,
        y: parentProp.y + rotated.y,
        facing: heading + (cfg.facingOffset ?? 0),
        height: childAsset.visuals?.world?.height ?? 12,
        visualOverride: cfg.inheritTint === true && parentProp.visualOverride ? { ...parentProp.visualOverride } : undefined,
        _visualAttachmentId: cfg.id,
    };
    initWorldPropShape(prop);
    scaleVirtualPropShape(prop, resolveVirtualPropScale(parentProp, prop, cfg));
    return prop;
}
/**
 * @param {object} parentProp Parent prop in stage coordinates with quantized facing.
 * @returns {{ before: object[], after: object[] }}
 */
export function resolveVisualAttachmentProps(parentProp) {
    const before = [];
    const after = [];
    const attachments = getPropVisualAttachmentConfigs(parentProp);
    for (let i = 0; i < attachments.length; i++) {
        const cfg = attachments[i];
        if (!cfg?.id || !cfg.propId) continue;
        const heading = resolveQuantizedAttachmentHeading(parentProp, cfg);
        const child = createVirtualAttachmentProp(parentProp, cfg, heading);
        if (!child) continue;
        if ((cfg.layer ?? 0) < 0) before.push(child);
        else after.push(child);
    }
    return { before, after };
}
/** @param {object} prop */
export function resolveVisualAttachmentBakeRadius(prop, parentFacing) {
    const attachments = getPropVisualAttachmentConfigs(prop);
    let radius = 0;
    for (let i = 0; i < attachments.length; i++) {
        const cfg = attachments[i];
        if (!cfg?.id || !cfg.propId) continue;
        const heading = cfg.heading === "velocity" ? resolveQuantizedAttachmentHeading(prop, cfg) : parentFacing;
        const child = createVirtualAttachmentProp({ ...prop, x: 0, y: 0, facing: parentFacing }, cfg, heading);
        if (!child) continue;
        const extents = propFootprintHalfExtents(child);
        const childRadius = Math.max(resolveBodyRadius(child), extents.x, extents.y);
        radius = Math.max(radius, Math.hypot(child.x, child.y) + childRadius);
    }
    return radius;
}
