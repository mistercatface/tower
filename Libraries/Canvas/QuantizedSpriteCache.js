import { prepModifiedBlit } from "../Render/spriteDrawModifier.js";
import { createBakedSpriteCache } from "./BakedSpriteCache.js";
import { quantizeAngle, quantizeAngleIndex, quantizeViewOffset } from "./viewQuantize.js";
import { clamp } from "../Math/Interpolate.js";
import { buildRollOrientKey, quantizeRollQuat } from "../Props/rollingMotion.js";
import { standTipStageRadius } from "../Spatial/transforms/longAxisBox3d.js";
import { resolvePropBakeScaleForProp, resolvePropPixelSizeForProp, quantizePropBakeZoom } from "../../Core/GamePropPixelSize.js";
import { resolveBodyRadius } from "../Motion/bodyDefaults.js";
import { resolvePropQuantizeSteps, getBaseSpriteCacheKey, getPropStageBakeState, propFootprintHalfExtents } from "../Props/propStrategy.js";
/**
 * LRU baked-sprite cache with shared viewer-offset quantization.
 * Kinematics bodies and iso props both use this; domain key/bake helpers live below.
 *
 * @param {{ maxItems?: number, viewStep?: number, viewLimit?: number }} [options]
 */
export function createQuantizedSpriteCache({ maxItems = 2000, viewStep = 30, viewLimit = 120 } = {}) {
    const baked = createBakedSpriteCache({ maxItems });
    return {
        maxItems: baked.maxItems,
        cache: baked.cache,
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
            const cached = baked.get(key);
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
/**
 * World-anchored blit (iso props). Opacity applied at blit time, not bake time.
 *
 * @param {import("../Render/spriteDrawModifier.js").SpriteDrawModifier | null} [modifier]
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
    ctx.save();
    prepModifiedBlit(ctx, modifier);
    const smoothDownscale = bakeScale > 1;
    const prevSmooth = ctx.imageSmoothingEnabled;
    if (smoothDownscale) ctx.imageSmoothingEnabled = true;
    ctx.translate(drawX, drawY);
    if (scale !== 1) ctx.scale(scale, scale);
    ctx.drawImage(sprite, -anchorX, -anchorY, drawW, drawH);
    if (smoothDownscale) ctx.imageSmoothingEnabled = prevSmooth;
    ctx.restore();
}
/**
 * Center-anchored blit (kinematics humanoids).
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {CanvasImageSource & { drawRatio?: number, verticalShift?: number, width: number, height: number }} sprite
 * @param {number} x
 * @param {number} y
 * @param {number} displayDiameter
 * @param {import("../Render/spriteDrawModifier.js").SpriteDrawModifier | null} [modifier]
 */
export function blitCenteredSprite(ctx, sprite, x, y, displayDiameter, modifier = null) {
    const drawRatio = sprite.drawRatio ?? 1;
    const drawW = displayDiameter * drawRatio;
    const drawH = drawW * (sprite.height / sprite.width);
    const vShift = (sprite.verticalShift ?? 0) * (drawW / sprite.width);
    const drawX = modifier?.drawX ?? x;
    const drawY = modifier?.drawY ?? y;
    const scale = modifier?.scale ?? 1;
    ctx.save();
    prepModifiedBlit(ctx, modifier);
    ctx.translate(drawX, drawY);
    if (scale !== 1) ctx.scale(scale, scale);
    ctx.drawImage(sprite, -drawW / 2, -drawH / 2 - vShift, drawW, drawH);
    ctx.restore();
}
// ─── Kinematics preset ───────────────────────────────────────────────────────
export function createKinematicsSpriteCache() {
    const cache = createQuantizedSpriteCache({ maxItems: 2000 });
    const rotationSteps = 32;
    const animFrames = 30;
    const tiltSteps = 5;
    const cachePadding = 40;
    return {
        ...cache,
        rotationSteps,
        animFrames,
        tiltSteps,
        cachePadding,
        getKey(id, pose, rotation, cycle, crouch, tiltFactor, weaponKey = "", aimKey = "", dx = 0, dy = 0, animFrame = 0) {
            const qRot = quantizeAngleIndex(rotation, rotationSteps);
            const qCyc = quantizeAngleIndex(cycle, animFrames);
            const qCrouch = crouch > 0.5 ? 1 : 0;
            const qTilt = Math.floor(tiltFactor * (tiltSteps - 1));
            const { keyDx, keyDy } = cache.quantizeView(dx, dy);
            return `${id}_${pose}_${weaponKey}_${aimKey}_${qRot}_${qCyc}_${qCrouch}_${qTilt}_${keyDx}_${keyDy}_${animFrame}`;
        },
        set(key, sourceCanvas) {
            return cache.set(key, sourceCanvas, { drawRatio: sourceCanvas.drawRatio, verticalShift: sourceCanvas.verticalShift });
        },
        getQuantizedValues(rotation, cycle, tiltFactor, dx = 0, dy = 0) {
            const qRot = quantizeAngle(rotation, rotationSteps);
            const qCyc = quantizeAngle(cycle, animFrames);
            const bucket = Math.floor(tiltFactor * (tiltSteps - 1));
            const qTilt = bucket / (tiltSteps - 1);
            const { dx: qDx, dy: qDy } = cache.quantizeView(dx, dy);
            return { rotation: qRot, cycle: qCyc, tilt: qTilt, dx: qDx, dy: qDy };
        },
    };
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
        const stageR = prop.strategy?.standTip ? standTipStageRadius(prop) : resolveBodyRadius(prop);
        const footprint = propFootprintHalfExtents(prop);
        const worldDiameter = Math.max(stageR * 2, footprint.x * 2, footprint.y * 2);
        const bakeScale = resolvePropBakeScaleForProp(prop, worldDiameter, zoom);
        const stageSpan = Math.ceil((stageR * 2.6 + PROP_STAGE_PADDING * 2) * bakeScale);
        const anchorX = PROP_STAGE_PADDING + stageR * 1.3;
        const anchorY = PROP_STAGE_PADDING + stageR * 1.3;
        const canvas = new OffscreenCanvas(stageSpan, stageSpan);
        const ctx = canvas.getContext("2d", { alpha: true });
        const stageProp = getPropStageBakeState(prop, { quantizeAngle, quantizeRollQuat, anchorX, anchorY });
        stageProp.radius = resolveBodyRadius(prop);
        ctx.save();
        if (bakeScale !== 1) ctx.scale(bakeScale, bakeScale);
        const prevSmooth = ctx.imageSmoothingEnabled;
        if (bakeScale > 1) ctx.imageSmoothingEnabled = true;
        draw(ctx, stageProp, anchorX - qDx, anchorY - qDy);
        if (bakeScale > 1) ctx.imageSmoothingEnabled = prevSmooth;
        ctx.restore();
        return { canvas, meta: { anchorX, anchorY, bakeScale } };
    });
}
export function clearPropSpriteCache() {
    propSpriteCache.clear();
}
