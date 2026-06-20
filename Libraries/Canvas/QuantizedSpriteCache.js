import { prepModifiedBlit, resolveSpriteDrawModifier } from "../Render/spriteDrawModifier.js";
import { acquireOffscreenCanvas } from "./offscreenCanvas.js";
import { createBakedSpriteCache } from "./BakedSpriteCache.js";
import { quantizeAngle, quantizeAngleIndex, quantizeViewOffset } from "./viewQuantize.js";
import { clamp } from "../Math/Interpolate.js";
import { buildRollOrientKey, quantizeRollQuat } from "../Props/rollingMotion.js";
import { resolvePropBakeScaleForProp, resolvePropPixelSizeForProp, quantizePropBakeZoom, resolvePropBakeScale } from "../../Core/GamePropPixelSize.js";
import { resolveBodyRadius } from "../Motion/bodyDefaults.js";
import { resolvePropQuantizeSteps, getBaseSpriteCacheKey, getPropStageBakeState, propFootprintHalfExtents } from "../Props/propStrategy.js";
/**
 * LRU baked-sprite cache with shared viewer-offset quantization.
 * Iso props use this; domain key/bake helpers live below.
 *
 * @param {{ maxItems?: number, viewStep?: number, viewLimit?: number }} [options]
 */
export function createQuantizedSpriteCache({ maxItems = 2000, viewStep = 30, viewLimit = 120 } = {}) {
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
        viewStep,
        viewLimit,
        quantizeView(dx, dy) {
            return quantizeViewOffset(dx, dy, viewStep, viewLimit);
        },
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
function drawImageWithModifier(ctx, image, dx, dy, dw, dh, modifier) {
    if (modifier?.clipCircle) {
        ctx.save();
        prepModifiedBlit(ctx, modifier);
        ctx.drawImage(image, dx, dy, dw, dh);
        ctx.restore();
        return;
    }
    if (modifier?.alpha != null) {
        const prevAlpha = ctx.globalAlpha;
        ctx.globalAlpha = prevAlpha * modifier.alpha;
        ctx.drawImage(image, dx, dy, dw, dh);
        ctx.globalAlpha = prevAlpha;
        return;
    }
    ctx.drawImage(image, dx, dy, dw, dh);
}
/**
 * World-anchored blit for iso props. Opacity applied at blit time, not bake time.
 */
export function blitAnchoredSprite(ctx, sprite, worldX, worldY, modifier = null) {
    const bakeScale = sprite.bakeScale ?? 1;
    const anchorX = sprite.anchorX ?? 0;
    const anchorY = sprite.anchorY ?? 0;
    const drawW = sprite.width / bakeScale;
    const drawH = sprite.height / bakeScale;
    const drawX = modifier?.drawX ?? worldX;
    const drawY = modifier?.drawY ?? worldY;
    const scale = modifier?.scale ?? 1;
    drawImageWithModifier(ctx, sprite, drawX - anchorX * scale, drawY - anchorY * scale, drawW * scale, drawH * scale, modifier);
}
// ─── Iso prop preset ─────────────────────────────────────────────────────────
const propSpriteCache = createQuantizedSpriteCache({ maxItems: 2560 });
const PROP_STAGE_PADDING = 40;
/**
 * @param {object} prop
 * @param {number} px
 * @param {number} py
 * @param {string} renderKey
 * @param {number} [animFrame]
 * @param {number} [zoom]
 */
export function buildPropSpriteKey(prop, px, py, renderKey, animFrame = 0, zoom = 1) {
    const dx = prop.x - px;
    const dy = prop.y - py;
    // Note: To avoid over-granular sub-pixel caching thrash, dx/dy view quantization
    // uses the robust step/limit algorithm baked into propSpriteCache.quantizeView().
    const { keyDx, keyDy } = propSpriteCache.quantizeView(dx, dy);
    const basePhysicsKey = getBaseSpriteCacheKey(prop, { quantizeAngleIndex, buildRollOrientKey });
    const customKey = prop.strategy?.getCustomSpriteCacheKey?.(prop) ?? prop.getCustomSpriteCacheKey?.(prop) ?? "";
    const customPart = customKey ? `_${customKey}` : "";
    const pixelSize = resolvePropPixelSizeForProp(prop);
    const pixelKey = pixelSize ? `_px${pixelSize}` : "";
    const zoomKey = `_z${quantizePropBakeZoom(zoom)}`;
    return `${renderKey}${customPart}_${basePhysicsKey}_${keyDx}_${keyDy}_${animFrame}${pixelKey}${zoomKey}`;
}
/**
 * @param {object} spec
 * @param {object} spec.prop
 * @param {number} spec.px
 * @param {number} spec.py
 * @param {string} spec.renderKey
 * @param {(ctx: CanvasRenderingContext2D, prop: object, px: number, py: number) => void} spec.draw
 * @param {number} [spec.animFrame]
 * @param {number} [spec.zoom]
 */
export function getOrBakePropSprite({ prop, px, py, renderKey, draw, animFrame = 0, zoom = 1 }) {
    const key = buildPropSpriteKey(prop, px, py, renderKey, animFrame, zoom);
    return propSpriteCache.getOrBake(key, () => {
        const dx = prop.x - px;
        const dy = prop.y - py;
        const { dx: qDx, dy: qDy } = propSpriteCache.quantizeView(dx, dy);
        const stageR = resolveBodyRadius(prop);
        const footprint = propFootprintHalfExtents(prop);
        const worldDiameter = Math.max(stageR * 2, footprint.x * 2, footprint.y * 2);
        const bakeScale = resolvePropBakeScaleForProp(prop, worldDiameter, zoom);
        const stageSpan = Math.ceil((stageR * 2.6 + PROP_STAGE_PADDING * 2) * bakeScale);
        const anchorX = PROP_STAGE_PADDING + stageR * 1.3;
        const anchorY = PROP_STAGE_PADDING + stageR * 1.3;
        const canvas = acquireOffscreenCanvas(stageSpan, stageSpan);
        const ctx = canvas.getContext("2d");
        const stageProp = getPropStageBakeState(prop, { quantizeAngle, quantizeRollQuat, anchorX, anchorY });
        stageProp.radius = resolveBodyRadius(prop);
        ctx.save();
        if (bakeScale !== 1) ctx.scale(bakeScale, bakeScale);
        draw(ctx, stageProp, anchorX - qDx, anchorY - qDy);
        ctx.restore();
        return { canvas, meta: { anchorX, anchorY, bakeScale } };
    });
}
export function clearPropSpriteCache() {
    propSpriteCache.clear();
    overlaySpriteCache.clear();
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
/**
 * @param {number} worldX
 * @param {number} worldY
 * @param {number} px
 * @param {number} py
 * @param {string} renderKey
 * @param {string} customKey
 * @param {number} [zoom]
 */
export function buildOverlaySpriteKey(worldX, worldY, px, py, renderKey, customKey, zoom = 1) {
    const { keyDx, keyDy } = overlaySpriteCache.quantizeView(worldX - px, worldY - py);
    return `${renderKey}_${customKey}_${keyDx}_${keyDy}_z${quantizePropBakeZoom(zoom)}`;
}
/**
 * @param {object} spec
 * @param {number} spec.worldX
 * @param {number} spec.worldY
 * @param {number} spec.px
 * @param {number} spec.py
 * @param {string} spec.renderKey
 * @param {string} spec.customKey
 * @param {number} spec.worldSpan
 * @param {(ctx: CanvasRenderingContext2D, anchorX: number, anchorY: number) => void} spec.draw
 * @param {number} [spec.zoom]
 */
export function getOrBakeOverlaySprite({ worldX, worldY, px, py, renderKey, customKey, worldSpan, draw, zoom = 1 }) {
    const key = buildOverlaySpriteKey(worldX, worldY, px, py, renderKey, customKey, zoom);
    return overlaySpriteCache.getOrBake(key, () => {
        const bakeScale = resolvePropBakeScale(worldSpan, undefined, false, zoom);
        const stageSpan = Math.ceil((worldSpan + OVERLAY_STAGE_PADDING * 2) * bakeScale);
        const anchorX = stageSpan / 2;
        const anchorY = stageSpan / 2;
        const canvas = acquireOffscreenCanvas(stageSpan, stageSpan);
        const ctx = canvas.getContext("2d");
        ctx.save();
        if (bakeScale !== 1) ctx.scale(bakeScale, bakeScale);
        draw(ctx, anchorX, anchorY);
        ctx.restore();
        return { canvas, meta: { anchorX, anchorY, bakeScale } };
    });
}
/** @typedef {(ctx: CanvasRenderingContext2D, anchorX: number, anchorY: number) => void} OverlayDrawRecipe */
/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} worldX
 * @param {number} worldY
 * @param {number} px
 * @param {number} py
 * @param {string} renderKey
 * @param {string} customKey
 * @param {number} worldSpan
 * @param {OverlayDrawRecipe} draw
 * @param {{ zoom?: number }} [opts]
 */
export function drawCachedOverlayGlyph(ctx, worldX, worldY, px, py, renderKey, customKey, worldSpan, draw, { zoom = 1 } = {}) {
    const sprite = getOrBakeOverlaySprite({ worldX, worldY, px, py, renderKey, customKey, worldSpan, draw, zoom });
    blitAnchoredSprite(ctx, sprite, worldX, worldY);
}
export function clearOverlaySpriteCache() {
    overlaySpriteCache.clear();
}
/** @typedef {import("../Render/Props3D/PropRenderer.js").PropDrawRecipe} PropDrawRecipe */
/**
 * Mandatory draw path for iso/grid stamps and world props (except 3D building walls).
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} prop
 * @param {number} px
 * @param {number} py
 * @param {string} renderKey
 * @param {PropDrawRecipe} draw
 * @param {{ animFrame?: number, zoom?: number, modifier?: import("../Render/spriteDrawModifier.js").SpriteDrawModifier | null }} [opts]
 */
export function drawCachedPropSprite(ctx, prop, px, py, renderKey, draw, { animFrame = 0, zoom = 1, modifier = null } = {}) {
    const sprite = getOrBakePropSprite({ prop, px, py, renderKey, draw, animFrame, zoom });
    const resolvedModifier = modifier ?? resolveSpriteDrawModifier(prop, { x: px, y: py });
    blitAnchoredSprite(ctx, sprite, prop.x, prop.y, resolvedModifier);
}
