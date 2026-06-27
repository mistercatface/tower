import { quantizeAngle, quantizeAngleIndex } from "../Math/Angle.js";
import propCatalog from "../../Assets/props/index.js";
import { prepModifiedBlit, resolveSpriteDrawModifier } from "../Render/spriteDrawModifier.js";
import { acquireOffscreenCanvas } from "./offscreenCanvas.js";
import { createBakedSpriteCache } from "./BakedSpriteCache.js";
import { clamp } from "../Math/Interpolate.js";
import { buildRollOrientKey, quantizeRollQuat } from "../Props/rollingMotion.js";
import { resolvePropBakeScaleForProp, resolvePropPixelSizeForProp, quantizePropBakeZoom, resolvePropBakeScale } from "../../Core/GamePropPixelSize.js";
import { resolveBodyRadius } from "../Motion/bodyDefaults.js";
import { resolvePropQuantizeSteps, getBaseSpriteCacheKey, getPropStageBakeState, propFootprintHalfExtents } from "../Props/propStrategy.js";
import { getVisualAttachmentSpriteCacheKey, resolveVisualAttachmentBakeRadius, resolveVisualAttachmentProps } from "../Props/propVisualAttachments.js";
const SPRITE_VIEW_STEP = 30;
const SPRITE_VIEW_LIMIT = 120;
function packQuantizedViewBucket(dx, dy, step = SPRITE_VIEW_STEP, limit = SPRITE_VIEW_LIMIT) {
    const keyDx = Math.round(clamp(dx, -limit, limit) / step);
    const keyDy = Math.round(clamp(dy, -limit, limit) / step);
    return ((keyDx + 32) << 6) | (keyDy + 32);
}
function quantizedViewAxisOffset(offset, step = SPRITE_VIEW_STEP, limit = SPRITE_VIEW_LIMIT) {
    return Math.round(clamp(offset, -limit, limit) / step) * step;
}
const SPRITE_KEY_INTERN_MAX = 0xfffff;
const spriteKeyIntern = new Map();
let spriteKeyInternNext = 1;
function internSpriteKeyPart(part) {
    if (!part) return 0;
    let id = spriteKeyIntern.get(part);
    if (id === undefined) {
        id = spriteKeyInternNext++;
        if (spriteKeyInternNext > SPRITE_KEY_INTERN_MAX) throw new Error("sprite key intern table overflow");
        spriteKeyIntern.set(part, id);
    }
    return id;
}
function clearSpriteKeyIntern() {
    spriteKeyIntern.clear();
    spriteKeyInternNext = 1;
}
function packZoomKeyBucket(zoom) {
    return Math.round(quantizePropBakeZoom(zoom) * 8);
}
const PROP_SPRITE_KEY_DEPS = { quantizeAngleIndex, buildRollOrientKey };
function internedPropPhysicsKey(prop) {
    const key = getBaseSpriteCacheKey(prop, PROP_SPRITE_KEY_DEPS);
    return internSpriteKeyPart(key);
}
/**
 * LRU baked-sprite cache with shared viewer-offset quantization.
 * Iso props use this; domain key/bake helpers live below.
 *
 * @param {{ maxItems?: number }} [options]
 */
function createQuantizedSpriteCache({ maxItems = 2000 } = {}) {
    const baked = createBakedSpriteCache({ maxItems });
    const telemetry = { requests: 0, misses: 0, evictions: 0, uniqueKeys: new Set() };
    const originalOnEvict = baked.cache.onEvict;
    baked.cache.onEvict = (key, value) => {
        telemetry.evictions++;
        if (originalOnEvict) originalOnEvict(key, value);
    };
    return {
        maxItems: baked.maxItems,
        cache: baked.cache,
        telemetry,
        get(key) {
            return baked.get(key);
        },
        set(key, sourceCanvas, meta = {}) {
            return baked.set(key, sourceCanvas, meta);
        },
        /**
         * @param {string} key
         * @param {() => OffscreenCanvas | { canvas: OffscreenCanvas, meta?: Record<string, unknown> }} bakeFn
         */
        getOrBake(key, bakeFn) {
            this.telemetry.requests++;
            this.telemetry.uniqueKeys.add(key);
            const cached = baked.get(key);
            if (!cached) this.telemetry.misses++;
            // Evaluate cache pressure periodically
            if (this.telemetry.requests >= 2000) {
                const workingSet = this.telemetry.uniqueKeys.size;
                // If working set is pushing the cache limits and we are thrashing
                if (workingSet > baked.cache.maxSize * 0.8 && this.telemetry.evictions > 0) {
                    baked.cache.maxSize = Math.max(baked.cache.maxSize, Math.ceil(workingSet * 1.5));
                    this.maxItems = baked.cache.maxSize;
                }
                this.telemetry.requests = 0;
                this.telemetry.misses = 0;
                this.telemetry.evictions = 0;
                this.telemetry.uniqueKeys.clear();
            }
            if (cached) return cached;
            const result = bakeFn();
            if (result instanceof OffscreenCanvas || (typeof HTMLCanvasElement !== "undefined" && result instanceof HTMLCanvasElement))
                return baked.set(key, result, { drawRatio: result.drawRatio, verticalShift: result.verticalShift });
            const { canvas, meta = {} } = result;
            return baked.set(key, canvas, meta);
        },
        clear() {
            baked.clear();
        },
    };
}
export function blitAnchoredSprite(ctx, sprite, worldX, worldY, modifier = null) {
    const bakeScale = sprite.bakeScale ?? 1;
    const anchorX = sprite.anchorX ?? 0;
    const anchorY = sprite.anchorY ?? 0;
    const drawW = sprite.width / bakeScale;
    const drawH = sprite.height / bakeScale;
    const drawX = modifier?.drawX ?? worldX;
    const drawY = modifier?.drawY ?? worldY;
    const scale = modifier?.scale ?? 1;
    // Fast path for 99% of sprites that have no modifier
    if (!modifier) {
        ctx.drawImage(sprite, drawX - anchorX * scale, drawY - anchorY * scale, drawW * scale, drawH * scale);
        return;
    }
    if (modifier.clipCircle) {
        ctx.save();
        prepModifiedBlit(ctx, modifier);
        ctx.drawImage(sprite, drawX - anchorX * scale, drawY - anchorY * scale, drawW * scale, drawH * scale);
        ctx.restore();
        return;
    }
    if (modifier.alpha != null) {
        const prevAlpha = ctx.globalAlpha;
        ctx.globalAlpha = prevAlpha * modifier.alpha;
        ctx.drawImage(sprite, drawX - anchorX * scale, drawY - anchorY * scale, drawW * scale, drawH * scale);
        ctx.globalAlpha = prevAlpha;
        return;
    }
    ctx.drawImage(sprite, drawX - anchorX * scale, drawY - anchorY * scale, drawW * scale, drawH * scale);
}
// ─── Iso prop preset ─────────────────────────────────────────────────────────
const propSpriteCache = createQuantizedSpriteCache({ maxItems: 2560 });
const PROP_STAGE_PADDING = 40;
function drawVisualAttachmentList(ctx, attachments, viewport) {
    for (let i = 0; i < attachments.length; i++) {
        const child = attachments[i];
        const childRenderKey = child.getRender3DKey?.() ?? child.strategy?.render3DKey;
        const childDraw = propCatalog[childRenderKey]?.drawRecipe;
        if (childDraw) childDraw(ctx, child, viewport);
    }
}
/**
 * @param {object} prop
 * @param {import("../Viewport/Viewport.js").Viewport} viewport
 * @param {string} renderKey
 * @param {(ctx: CanvasRenderingContext2D, prop: object, viewport: import("../Viewport/Viewport.js").Viewport) => void} draw
 * @param {number} [animFrame]
 */
function getOrBakePropSprite(prop, viewport, renderKey, draw, animFrame = 0, state = null) {
    const px = viewport.x;
    const py = viewport.y;
    const zoom = viewport.zoom ?? 1;
    const dx = prop.x - px;
    const dy = prop.y - py;
    const customKey = prop.strategy?.getCustomSpriteCacheKey?.(prop, state) ?? prop.getCustomSpriteCacheKey?.(prop, state) ?? "";
    const attachmentKey = getVisualAttachmentSpriteCacheKey(prop, { quantizeAngleIndex });
    const pixelSize = resolvePropPixelSizeForProp(prop);
    let key = BigInt(internSpriteKeyPart(renderKey));
    key = (key << 20n) | BigInt(internSpriteKeyPart(customKey));
    key = (key << 20n) | BigInt(internedPropPhysicsKey(prop));
    key = (key << 20n) | BigInt(internSpriteKeyPart(attachmentKey));
    key = (key << 12n) | BigInt(packQuantizedViewBucket(dx, dy));
    key = (key << 16n) | BigInt(animFrame & 0xffff);
    key = (key << 16n) | BigInt((pixelSize ?? 0) & 0xffff);
    key = (key << 16n) | BigInt(packZoomKeyBucket(zoom) & 0xffff);
    return propSpriteCache.getOrBake(key, () => {
        const qDx = quantizedViewAxisOffset(dx);
        const qDy = quantizedViewAxisOffset(dy);
        const parentFacing = quantizeAngle(prop.facing ?? 0, resolvePropQuantizeSteps(prop).facing);
        const footprint = propFootprintHalfExtents(prop);
        const baseR = Math.max(resolveBodyRadius(prop), footprint.x, footprint.y);
        const stageR = Math.max(baseR, resolveVisualAttachmentBakeRadius(prop, parentFacing));
        const worldDiameter = stageR * 2;
        const bakeScale = resolvePropBakeScaleForProp(prop, worldDiameter, zoom);
        const stageSpan = Math.ceil((stageR * 2.6 + PROP_STAGE_PADDING * 2) * bakeScale);
        const anchorX = PROP_STAGE_PADDING + stageR * 1.3;
        const anchorY = PROP_STAGE_PADDING + stageR * 1.3;
        const canvas = acquireOffscreenCanvas(stageSpan, stageSpan);
        const ctx = canvas.getContext("2d");
        const stageProp = getPropStageBakeState(prop, { quantizeAngle, quantizeRollQuat, anchorX, anchorY });
        stageProp.radius = resolveBodyRadius(prop);
        const attachments = resolveVisualAttachmentProps(stageProp);
        ctx.save();
        if (bakeScale !== 1) ctx.scale(bakeScale, bakeScale);
        ctx.translate(anchorX - prop.x, anchorY - prop.y);
        drawVisualAttachmentList(ctx, attachments.before, viewport);
        draw(ctx, stageProp, viewport, state);
        drawVisualAttachmentList(ctx, attachments.after, viewport);
        ctx.restore();
        return { canvas, meta: { anchorX, anchorY, bakeScale } };
    });
}
export function clearPropSpriteCache() {
    propSpriteCache.clear();
    overlaySpriteCache.clear();
    clearSpriteKeyIntern();
}
/** QuantizedSpriteCache render keys for grid-stamped occupancy (not WorldProp assets). */
export const GRID_STAMP_RENDER_KEY = { ForcefieldEdge: "grid_forcefield_edge", FloorBelt: "grid_floor_belt", PassagePowerSource: "grid_passage_power_source" };
/** Render keys for baked sandbox/editor overlay glyphs. */
export const OVERLAY_RENDER_KEY = {
    SelectionRing: "overlay_selection_ring",
    PathDestination: "overlay_path_destination",
    PathArrowHead: "overlay_path_arrow_head",
    FlowDirectionArrow: "overlay_flow_direction_arrow",
    WireEndpoint: "overlay_wire_endpoint",
    GridCellHighlight: "overlay_grid_cell_highlight",
    PathDebugNode: "overlay_path_debug_node",
};
const OVERLAY_STAGE_PADDING = 6;
const overlaySpriteCache = createQuantizedSpriteCache({ maxItems: 1024 });
/** @typedef {(ctx: CanvasRenderingContext2D, anchorX: number, anchorY: number) => void} OverlayDrawRecipe */
/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} worldX
 * @param {number} worldY
 * @param {import("../Viewport/Viewport.js").Viewport} viewport
 * @param {string} renderKey
 * @param {string} customKey
 * @param {number} worldSpan
 * @param {OverlayDrawRecipe} draw
 */
export function drawCachedOverlayGlyph(ctx, worldX, worldY, viewport, renderKey, customKey, worldSpan, draw) {
    const px = viewport.x;
    const py = viewport.y;
    const zoom = viewport.zoom;
    let key = BigInt(internSpriteKeyPart(renderKey));
    key = (key << 20n) | BigInt(internSpriteKeyPart(customKey));
    key = (key << 12n) | BigInt(packQuantizedViewBucket(worldX - px, worldY - py));
    key = (key << 16n) | BigInt(packZoomKeyBucket(zoom) & 0xffff);
    const sprite = overlaySpriteCache.getOrBake(key, () => {
        const bakeScale = resolvePropBakeScale(worldSpan, undefined, false, zoom);
        const stageSpan = Math.ceil((worldSpan + OVERLAY_STAGE_PADDING * 2) * bakeScale);
        const anchorX = stageSpan / 2;
        const anchorY = stageSpan / 2;
        const canvas = acquireOffscreenCanvas(stageSpan, stageSpan);
        const bakeCtx = canvas.getContext("2d");
        bakeCtx.save();
        if (bakeScale !== 1) bakeCtx.scale(bakeScale, bakeScale);
        draw(bakeCtx, anchorX, anchorY);
        bakeCtx.restore();
        return { canvas, meta: { anchorX, anchorY, bakeScale } };
    });
    blitAnchoredSprite(ctx, sprite, worldX, worldY);
}
/** @typedef {(ctx: CanvasRenderingContext2D, prop: object, viewport: import("../Viewport/Viewport.js").Viewport) => void} PropDrawRecipe */
/**
 * Mandatory draw path for iso/grid stamps and world props (except 3D building walls).
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} prop
 * @param {import("../Viewport/Viewport.js").Viewport} viewport
 * @param {string} renderKey
 * @param {PropDrawRecipe} draw
 * @param {number} [animFrame]
 */
export function drawCachedPropSprite(ctx, prop, viewport, renderKey, draw, animFrame = 0, state = null) {
    const sprite = getOrBakePropSprite(prop, viewport, renderKey, draw, animFrame, state);
    const modifier = resolveSpriteDrawModifier(prop, viewport.x, viewport.y);
    blitAnchoredSprite(ctx, sprite, prop.x, prop.y, modifier);
}
