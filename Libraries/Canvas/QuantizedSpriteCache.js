import { createBakedSpriteCache } from "./BakedSpriteCache.js";
import { quantizeAngle, quantizeAngleIndex, quantizeViewOffset } from "./viewQuantize.js";
import { clamp } from "../Math/Interpolate.js";
import { buildRollOrientKey, quantizeRollQuat } from "../Props/rollingMotion.js";
import { isStandTipFallen, standTipStageRadius } from "../Spatial/transforms/longAxisBox3d.js";
import { getActivePropPixelSize, resolvePropBakeScale } from "../../Core/GamePropPixelSize.js";

/**
 * @typedef {ReturnType<createBakedSpriteCache>} BakedSpriteCache
 * @typedef {ReturnType<createQuantizedSpriteCache>} QuantizedSpriteCache
 */

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
            if (result instanceof OffscreenCanvas || (typeof HTMLCanvasElement !== "undefined" && result instanceof HTMLCanvasElement)) {
                return baked.set(key, result, {
                    drawRatio: result.drawRatio,
                    verticalShift: result.verticalShift,
                });
            }

            const { canvas, meta = {} } = result;
            return baked.set(key, canvas, meta);
        },

        clear() {
            baked.clear();
        },
    };
}

/** World-anchored blit (iso props). Opacity applied at blit time, not bake time. */
export function blitAnchoredSprite(ctx, sprite, worldX, worldY, { opacity = 1 } = {}) {
    const bakeScale = sprite.bakeScale ?? 1;
    const anchorX = sprite.anchorX ?? 0;
    const anchorY = sprite.anchorY ?? 0;
    const drawW = sprite.width / bakeScale;
    const drawH = sprite.height / bakeScale;

    ctx.save();
    if (opacity < 1) ctx.globalAlpha = clamp(opacity, 0, 1);
    const smoothDownscale = bakeScale > 1;
    const prevSmooth = ctx.imageSmoothingEnabled;
    if (smoothDownscale) ctx.imageSmoothingEnabled = true;
    ctx.drawImage(sprite, worldX - anchorX, worldY - anchorY, drawW, drawH);
    if (smoothDownscale) ctx.imageSmoothingEnabled = prevSmooth;
    ctx.restore();
}

/** Center-anchored blit (kinematics humanoids). */
export function blitCenteredSprite(ctx, sprite, x, y, displayDiameter, { opacity = 1 } = {}) {
    const drawRatio = sprite.drawRatio ?? 1;
    const drawW = displayDiameter * drawRatio;
    const drawH = drawW * (sprite.height / sprite.width);
    const vShift = (sprite.verticalShift ?? 0) * (drawW / sprite.width);

    ctx.save();
    if (opacity < 1) ctx.globalAlpha = clamp(opacity, 0, 1);
    ctx.translate(x, y);
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
            return cache.set(key, sourceCanvas, {
                drawRatio: sourceCanvas.drawRatio,
                verticalShift: sourceCanvas.verticalShift,
            });
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
const PROP_ROTATION_STEPS = 16;
/** In-plane spin (facing) buckets for long-axis logs. */
const LOG_SPIN_STEPS = 64;
/** End-over-end tumble (rollAngle) buckets for long-axis logs. */
const LOG_ROLL_STEPS = 32;
const PROP_STAGE_PADDING = 40;

/**
 * @param {object} prop
 */
export function quantizeLongAxisLogAngles(prop) {
    return {
        facing: quantizeAngle(prop.facing ?? 0, LOG_SPIN_STEPS),
        rollAngle: quantizeAngle(prop.rollAngle ?? 0, LOG_ROLL_STEPS),
    };
}

/**
 * @param {object} prop
 */
function propFootprintHalfExtents(prop) {
    const radius = prop._baseRadius ?? prop.radius ?? 8;
    if (isStandTipFallen(prop) && prop.halfExtents) {
        return { x: prop.halfExtents.x, y: prop.halfExtents.y };
    }
    return {
        x: prop.strategy?.halfExtents?.x ?? radius,
        y: prop.strategy?.halfExtents?.y ?? radius,
    };
}

/**
 * @param {object} prop
 */
export function buildLongAxisLogOrientKey(prop) {
    return `f${quantizeAngleIndex(prop.facing ?? 0, LOG_SPIN_STEPS)}_a${quantizeAngleIndex(prop.rollAngle ?? 0, LOG_ROLL_STEPS)}`;
}

/**
 * @param {object} prop
 * @param {number} px
 * @param {number} py
 * @param {string} renderKey
 * @param {number} [animFrame]
 */
export function buildPropSpriteKey(prop, px, py, renderKey, animFrame = 0) {
    const dx = prop.x - px;
    const dy = prop.y - py;
    const { keyDx, keyDy } = propSpriteCache.quantizeView(dx, dy);
    const orientKey = prop.strategy?.rollAxis === "long"
        ? buildLongAxisLogOrientKey(prop)
        : prop.strategy?.rolls
                ? buildRollOrientKey(prop.rollQuat, PROP_ROTATION_STEPS)
                : `f${quantizeAngleIndex(prop.facing ?? 0, PROP_ROTATION_STEPS)}`;
    const radius = Math.round(prop._baseRadius ?? prop.radius ?? 8);
    const { x: stratHx, y: stratHy } = propFootprintHalfExtents(prop);
    const halfX = Math.round(stratHx);
    const halfY = Math.round(stratHy);
    const opacityBucket = (prop.opacity ?? 1) < 0.99 ? "fade" : "solid";
    const poolBallKey = prop.poolBall
        ? `pb${prop.poolBall.kind}_${prop.poolBall.number ?? 0}`
        : "";
    return `${renderKey}_${poolBallKey}_${orientKey}_${keyDx}_${keyDy}_${radius}_${halfX}x${halfY}_${opacityBucket}_${animFrame}`;
}

/**
 * @param {object} spec
 * @param {object} spec.prop
 * @param {number} spec.px
 * @param {number} spec.py
 * @param {string} spec.renderKey
 * @param {(ctx: CanvasRenderingContext2D, prop: object, px: number, py: number) => void} spec.draw
 * @param {number} [spec.animFrame]
 */
export function getOrBakePropSprite({ prop, px, py, renderKey, draw, animFrame = 0 }) {
    const key = buildPropSpriteKey(prop, px, py, renderKey, animFrame);

    return propSpriteCache.getOrBake(key, () => {
        const dx = prop.x - px;
        const dy = prop.y - py;
        const { dx: qDx, dy: qDy } = propSpriteCache.quantizeView(dx, dy);
        const stageR = prop.strategy?.standTip ? standTipStageRadius(prop) : (prop._baseRadius ?? prop.radius ?? 8);
        const footprint = propFootprintHalfExtents(prop);
        const worldDiameter = Math.max(stageR * 2, footprint.x * 2, footprint.y * 2);
        const bakeScale = resolvePropBakeScale(worldDiameter, getActivePropPixelSize());
        const stageSpan = Math.ceil((stageR * 2.6 + PROP_STAGE_PADDING * 2) * bakeScale);
        const anchorX = PROP_STAGE_PADDING + stageR * 1.3;
        const anchorY = PROP_STAGE_PADDING + stageR * 1.3;

        const canvas = new OffscreenCanvas(stageSpan, stageSpan);
        const ctx = canvas.getContext("2d", { alpha: true });
        const logAngles = prop.strategy?.rollAxis === "long"
            ? quantizeLongAxisLogAngles(prop)
            : null;
        const stageProp = {
            ...prop,
            x: anchorX,
            y: anchorY,
            radius: prop._baseRadius ?? prop.radius ?? 8,
            halfExtents: footprint,
            facing: logAngles?.facing ?? quantizeAngle(prop.facing ?? 0, PROP_ROTATION_STEPS),
            rollAngle: logAngles?.rollAngle ?? prop.rollAngle,
            rollQuat: prop.strategy?.rolls && prop.strategy?.rollAxis !== "long"
                ? quantizeRollQuat(prop.rollQuat, PROP_ROTATION_STEPS)
                : prop.rollQuat,
            opacity: 1,
        };

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
