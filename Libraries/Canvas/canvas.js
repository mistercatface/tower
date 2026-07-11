import { WORLD_SURFACE_DEFAULTS } from "../../Config/world.js";
import { LruMap } from "../DataStructures/LruMap.js";
import { quantizeAngle, quantizeAngleIndex } from "../Math/math.js";
import { ENGINE_F32, M_VEC_A } from "../../Core/engineMemory.js";
import { buildRollOrientKey, quantizeRollQuat, resolveBodyRadius, entityFacing } from "../Physics/physics.js";
import { resolvePropBakeScaleForProp, resolvePropPixelSizeForProp, quantizePropBakeZoom, resolvePropBakeScale } from "../../Core/GamePropPixelSize.js";
import { resolvePropQuantizeSteps, getBaseSpriteCacheKey, getPropStageBakeState, propFootprintHalfExtentsInto, getVisualAttachmentSpriteCacheKey, resolveVisualAttachmentBakeRadius, resolveVisualAttachmentProps } from "../Props/props.js";
import { visualOverrideCacheKey } from "../Color/visualOverride.js";
import propCatalog from "../../Assets/props/index.js";
export function getCanvasLineScale(ctx) {
    return 1 / Math.max(0.001, ctx.getTransform().a);
}
/** @param {Uint8ClampedArray} data @param {[number, number, number]} rgb */
export function fillRgbaBuffer(data, rgb) {
    for (let i = 0; i < data.length; i += 4) {
        data[i] = rgb[0];
        data[i + 1] = rgb[1];
        data[i + 2] = rgb[2];
        data[i + 3] = 255;
    }
}
/** @param {Uint8ClampedArray} data @param {number} width @param {number} height @param {number} x @param {number} y @param {[number, number, number]} rgb */
export function setRgbaPixel(data, width, height, x, y, rgb) {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const i = (y * width + x) * 4;
    data[i] = rgb[0];
    data[i + 1] = rgb[1];
    data[i + 2] = rgb[2];
    data[i + 3] = 255;
}
/** @param {Uint8ClampedArray} data @param {number} width @param {number} height @param {number} x @param {number} y @param {number} rectW @param {number} rectH @param {[number, number, number]} rgb */
export function fillRgbaRect(data, width, height, x, y, rectW, rectH, rgb) {
    const xEnd = x + rectW;
    const yEnd = y + rectH;
    for (let py = y; py < yEnd; py++) for (let px = x; px < xEnd; px++) setRgbaPixel(data, width, height, px, py, rgb);
}
/** Axis-aligned horizontal or vertical line. */
export function strokeAxisLineRgba(data, width, height, x0, y0, x1, y1, rgb) {
    if (y0 === y1) {
        const lo = x0 < x1 ? x0 : x1;
        const hi = x0 < x1 ? x1 : x0;
        for (let x = lo; x <= hi; x++) setRgbaPixel(data, width, height, x, y0, rgb);
        return;
    }
    const lo = y0 < y1 ? y0 : y1;
    const hi = y0 < y1 ? y1 : y0;
    for (let y = lo; y <= hi; y++) setRgbaPixel(data, width, height, x0, y, rgb);
}
/** @param {Uint8Array | Uint8ClampedArray} rgbTriplets @param {Uint8ClampedArray} rgba @param {number} numPixels */
export function copyRgbTripletsToRgba(rgba, rgbTriplets, numPixels) {
    let rgbaIdx = 0;
    for (let i = 0; i < numPixels; i++) {
        rgba[rgbaIdx++] = rgbTriplets[i * 3];
        rgba[rgbaIdx++] = rgbTriplets[i * 3 + 1];
        rgba[rgbaIdx++] = rgbTriplets[i * 3 + 2];
        rgba[rgbaIdx++] = 255;
    }
}
const offscreenCanvasPool = new Map();
let poolCount = 0;
const POOL_MAX = 4096;
/**
 * Offscreen bake surfaces. Policy: `imageSmoothingEnabled` false at birth (and after resize).
 * Returns the canvas only — no wrapper object. Callers cache `getContext("2d")` locally if they need it.
 */
/** @param {number} width @param {number} height @returns {OffscreenCanvas} */
export function createOffscreenCanvas(width, height) {
    const canvas = new OffscreenCanvas(width, height);
    canvas.getContext("2d").imageSmoothingEnabled = false;
    return canvas;
}
/**
 * @param {number} width
 * @param {number} height
 * @returns {OffscreenCanvas}
 */
export function acquireOffscreenCanvas(width, height) {
    const key = (width << 16) | height;
    const list = offscreenCanvasPool.get(key);
    if (list && list.length > 0) {
        poolCount--;
        const canvas = list.pop();
        canvas.getContext("2d").clearRect(0, 0, width, height);
        return canvas;
    }
    return createOffscreenCanvas(width, height);
}
/**
 * @param {OffscreenCanvas} canvas
 */
export function releaseOffscreenCanvas(canvas) {
    if (poolCount < POOL_MAX) {
        const key = (canvas.width << 16) | canvas.height;
        let list = offscreenCanvasPool.get(key);
        if (!list) {
            list = [];
            offscreenCanvasPool.set(key, list);
        }
        list.push(canvas);
        poolCount++;
    }
}
/**
 * @param {OffscreenCanvas} canvas
 * @param {number} width
 * @param {number} height
 */
export function resizeOffscreenCanvas(canvas, width, height) {
    if (canvas.width === width && canvas.height === height) return;
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d").imageSmoothingEnabled = false;
}
/**
 * Low-level Canvas2D path tracing — geometry only, no fill/stroke/style.
 * Call inside ctx.beginPath() (or use helpers that call beginPath for you).
 *
 * Compound clips: call traceClosedFlatPolygon / traceAabbRect multiple times on one path, then clip once.
 */
export const TAU = Math.PI * 2;
/** @param {CanvasRenderingContext2D} ctx @param {number} cx @param {number} cy @param {number} radius */
export function traceCircle(ctx, cx, cy, radius) {
    ctx.arc(cx, cy, radius, 0, TAU);
}
/** @param {CanvasRenderingContext2D} ctx */
export function traceSegment(ctx, x0, y0, x1, y1) {
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
}
/** @param {CanvasRenderingContext2D} ctx @param {{ x: number, y: number }[]} points */
export function traceOpenPolyline(ctx, points) {
    if (points.length < 2) return;
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
}
export function traceClosedFlatPolygon(ctx, flatVerts, count) {
    if (count < 3) return;
    ctx.moveTo(flatVerts[0], flatVerts[1]);
    for (let i = 1; i < count; i++) ctx.lineTo(flatVerts[i * 2], flatVerts[i * 2 + 1]);
    ctx.closePath();
}
export function traceFlatQuad(ctx, tAx, tAy, tBx, tBy, bBx, bBy, bAx, bAy) {
    ctx.moveTo(tAx, tAy);
    ctx.lineTo(tBx, tBy);
    ctx.lineTo(bBx, bBy);
    ctx.lineTo(bAx, bAy);
    ctx.closePath();
}
/** Flat [x0,y0, x1,y1, ...] quad with consistent winding; does not close the path. */
export function traceWoundFlatQuad(ctx, flatVerts, vertCount) {
    const cross = (flatVerts[2] - flatVerts[0]) * (flatVerts[5] - flatVerts[3]) - (flatVerts[3] - flatVerts[1]) * (flatVerts[4] - flatVerts[2]);
    ctx.moveTo(flatVerts[0], flatVerts[1]);
    if (cross >= 0) for (let p = 1; p < vertCount; p++) ctx.lineTo(flatVerts[p * 2], flatVerts[p * 2 + 1]);
    else for (let p = vertCount - 1; p > 0; p--) ctx.lineTo(flatVerts[p * 2], flatVerts[p * 2 + 1]);
}
export function traceAabbRect(ctx, minX, minY, maxX, maxY) {
    ctx.rect(minX, minY, maxX - minX, maxY - minY);
}
/** @param {CanvasRenderingContext2D} ctx @param {number} cx @param {number} cy @param {number} radius @param {number} startAngle @param {number} endAngle @param {boolean} [counterclockwise] */
export function traceArc(ctx, cx, cy, radius, startAngle, endAngle, counterclockwise = false) {
    ctx.arc(cx, cy, radius, startAngle, endAngle, counterclockwise);
}
/** @param {CanvasRenderingContext2D} ctx @param {number} cx @param {number} cy @param {number} radius */
export function strokeCircle(ctx, cx, cy, radius) {
    ctx.beginPath();
    traceCircle(ctx, cx, cy, radius);
    ctx.stroke();
}
/** @param {CanvasRenderingContext2D} ctx @param {number} cx @param {number} cy @param {number} radius */
export function fillCircle(ctx, cx, cy, radius) {
    ctx.beginPath();
    traceCircle(ctx, cx, cy, radius);
    ctx.fill();
}
/** @param {CanvasRenderingContext2D} ctx @param {number} cx @param {number} cy @param {number} radius */
export function fillStrokeCircle(ctx, cx, cy, radius) {
    ctx.beginPath();
    traceCircle(ctx, cx, cy, radius);
    ctx.fill();
    ctx.stroke();
}
/** @param {CanvasRenderingContext2D} ctx @param {number} x0 @param {number} y0 @param {number} x1 @param {number} y1 */
export function strokeSegment(ctx, x0, y0, x1, y1) {
    ctx.beginPath();
    traceSegment(ctx, x0, y0, x1, y1);
    ctx.stroke();
}
/** @param {CanvasRenderingContext2D} ctx @param {{ x: number, y: number }[]} points */
export function strokeOpenPolyline(ctx, points) {
    ctx.beginPath();
    traceOpenPolyline(ctx, points);
    ctx.stroke();
}
/**
 * One path, one clip. `buildPath` traces subpaths on a fresh path; return false to skip clip.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {(ctx: CanvasRenderingContext2D) => boolean | void} buildPath
 * @returns {boolean}
 */
export function clipToPath(ctx, buildPath) {
    ctx.beginPath();
    if (buildPath(ctx) === false) return false;
    ctx.clip();
    return true;
}
const WALL_TEXTURE_SEAM_BLEED_PX = WORLD_SURFACE_DEFAULTS.wallTextureBleedPx;
export function drawImageTriangleWithBaseTransformScalars(ctx, img, s0x, s0y, s1x, s1y, s2x, s2y, d0x, d0y, d1x, d1y, d2x, d2y, baseA, baseB, baseC, baseD, baseE, baseF) {
    let ts0_x = s0x;
    let ts0_y = s0y;
    let ts1_x = s1x;
    let ts1_y = s1y;
    let ts2_x = s2x;
    let ts2_y = s2y;
    const cx = (d0x + d1x + d2x) / 3;
    const cy = (d0y + d1y + d2y) / 3;
    let dx = d0x - cx;
    let dy = d0y - cy;
    let len = Math.sqrt(dx * dx + dy * dy) || 1;
    let r0_x = d0x + (dx / len) * WALL_TEXTURE_SEAM_BLEED_PX;
    let r0_y = d0y + (dy / len) * WALL_TEXTURE_SEAM_BLEED_PX;
    dx = d1x - cx;
    dy = d1y - cy;
    len = Math.sqrt(dx * dx + dy * dy) || 1;
    let r1_x = d1x + (dx / len) * WALL_TEXTURE_SEAM_BLEED_PX;
    let r1_y = d1y + (dy / len) * WALL_TEXTURE_SEAM_BLEED_PX;
    dx = d2x - cx;
    dy = d2y - cy;
    len = Math.sqrt(dx * dx + dy * dy) || 1;
    let r2_x = d2x + (dx / len) * WALL_TEXTURE_SEAM_BLEED_PX;
    let r2_y = d2y + (dy / len) * WALL_TEXTURE_SEAM_BLEED_PX;
    let denom = ts0_x * (ts1_y - ts2_y) + ts1_x * (ts2_y - ts0_y) + ts2_x * (ts0_y - ts1_y);
    if (Math.abs(denom) < 0.001) return;
    if (denom < 0) {
        const tmp_sx = ts1_x;
        const tmp_sy = ts1_y;
        ts1_x = ts2_x;
        ts1_y = ts2_y;
        ts2_x = tmp_sx;
        ts2_y = tmp_sy;
        const tmp_rx = r1_x;
        const tmp_ry = r1_y;
        r1_x = r2_x;
        r1_y = r2_y;
        r2_x = tmp_rx;
        r2_y = tmp_ry;
        denom = -denom;
    }
    const m11 = (r0_x * (ts1_y - ts2_y) + r1_x * (ts2_y - ts0_y) + r2_x * (ts0_y - ts1_y)) / denom;
    const m12 = (r0_y * (ts1_y - ts2_y) + r1_y * (ts2_y - ts0_y) + r2_y * (ts0_y - ts1_y)) / denom;
    const m21 = (r0_x * (ts2_x - ts1_x) + r1_x * (ts0_x - ts2_x) + r2_x * (ts1_x - ts0_x)) / denom;
    const m22 = (r0_y * (ts2_x - ts1_x) + r1_y * (ts0_x - ts2_x) + r2_y * (ts1_x - ts0_x)) / denom;
    const offsetX = r0_x - m11 * ts0_x - m21 * ts0_y;
    const offsetY = r0_y - m12 * ts0_x - m22 * ts0_y;
    let srcMinX = Math.floor(Math.min(ts0_x, ts1_x, ts2_x));
    let srcMinY = Math.floor(Math.min(ts0_y, ts1_y, ts2_y));
    let srcMaxX = Math.ceil(Math.max(ts0_x, ts1_x, ts2_x));
    let srcMaxY = Math.ceil(Math.max(ts0_y, ts1_y, ts2_y));
    srcMinX = Math.max(0, srcMinX);
    srcMinY = Math.max(0, srcMinY);
    srcMaxX = Math.min(img.width, srcMaxX);
    srcMaxY = Math.min(img.height, srcMaxY);
    const srcW = srcMaxX - srcMinX;
    const srcH = srcMaxY - srcMinY;
    if (srcW <= 0 || srcH <= 0) return;
    ctx.setTransform(baseA, baseB, baseC, baseD, baseE, baseF);
    ctx.transform(m11, m12, m21, m22, offsetX, offsetY);
    ctx.drawImage(img, srcMinX, srcMinY, srcW, srcH, srcMinX, srcMinY, srcW, srcH);
    ctx.setTransform(baseA, baseB, baseC, baseD, baseE, baseF);
}
export function drawImageTriangleFlatWithBaseTransform(ctx, img, srcFlat, dstFlat, i0, i1, i2, baseA, baseB, baseC, baseD, baseE, baseF) {
    drawImageTriangleWithBaseTransformScalars(ctx, img, srcFlat[i0 * 2], srcFlat[i0 * 2 + 1], srcFlat[i1 * 2], srcFlat[i1 * 2 + 1], srcFlat[i2 * 2], srcFlat[i2 * 2 + 1], dstFlat[i0 * 2], dstFlat[i0 * 2 + 1], dstFlat[i1 * 2], dstFlat[i1 * 2 + 1], dstFlat[i2 * 2], dstFlat[i2 * 2 + 1], baseA, baseB, baseC, baseD, baseE, baseF);
}
export function drawImageQuadScalars(ctx, img, sx0, sy0, sx1, sy1, d0x, d0y, d1x, d1y, d2x, d2y, d3x, d3y) {
    const currentTransform = ctx.getTransform();
    drawImageQuadWithBaseTransformScalars(ctx, img, sx0, sy0, sx1, sy1, d0x, d0y, d1x, d1y, d2x, d2y, d3x, d3y, currentTransform.a, currentTransform.b, currentTransform.c, currentTransform.d, currentTransform.e, currentTransform.f);
}
export function drawImageQuadWithBaseTransformScalars(ctx, img, sx0, sy0, sx1, sy1, d0x, d0y, d1x, d1y, d2x, d2y, d3x, d3y, baseA, baseB, baseC, baseD, baseE, baseF) {
    const diag02 = (d2x - d0x) ** 2 + (d2y - d0y) ** 2;
    const diag13 = (d3x - d1x) ** 2 + (d3y - d1y) ** 2;
    if (diag13 < diag02) {
        drawImageTriangleWithBaseTransformScalars(ctx, img, sx0, sy0, sx1, sy0, sx0, sy1, d0x, d0y, d1x, d1y, d3x, d3y, baseA, baseB, baseC, baseD, baseE, baseF);
        drawImageTriangleWithBaseTransformScalars(ctx, img, sx1, sy0, sx1, sy1, sx0, sy1, d1x, d1y, d2x, d2y, d3x, d3y, baseA, baseB, baseC, baseD, baseE, baseF);
        return;
    }
    drawImageTriangleWithBaseTransformScalars(ctx, img, sx0, sy0, sx1, sy0, sx1, sy1, d0x, d0y, d1x, d1y, d2x, d2y, baseA, baseB, baseC, baseD, baseE, baseF);
    drawImageTriangleWithBaseTransformScalars(ctx, img, sx0, sy0, sx1, sy1, sx0, sy1, d0x, d0y, d2x, d2y, d3x, d3y, baseA, baseB, baseC, baseD, baseE, baseF);
}
export function drawImageQuadFromFlatRingsWithBaseTransform(ctx, img, sx0, sy0, sx1, sy1, baseRing, topRing, edgeIndex, count, baseA, baseB, baseC, baseD, baseE, baseF) {
    const ai = edgeIndex * 2;
    const bi = ((edgeIndex + 1) % count) * 2;
    drawImageQuadWithBaseTransformScalars(ctx, img, sx0, sy0, sx1, sy1, baseRing[ai], baseRing[ai + 1], baseRing[bi], baseRing[bi + 1], topRing[bi], topRing[bi + 1], topRing[ai], topRing[ai + 1], baseA, baseB, baseC, baseD, baseE, baseF);
}
/** Default radial stops for omnidirectional vision carve (destination-out). */
export const VISION_RADIAL_CUTOUT_STOPS = [
    { offset: 0, color: "rgba(255,255,255,1)" },
    { offset: 0.92, color: "rgba(255,255,255,0.85)" },
    { offset: 1, color: "rgba(255,255,255,0)" },
];
/** Clear buffer and paint a solid mask base (source-over). */
export function fillMaskBase(ctx, width, height, fillStyle) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = fillStyle;
    ctx.fillRect(0, 0, width, height);
}
/** Soft radial hole punched through the current mask (destination-out). */
export function cutOutRadialSoftDisc(ctx, cx, cy, radius, colorStops = VISION_RADIAL_CUTOUT_STOPS) {
    ctx.globalCompositeOperation = "destination-out";
    const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    for (let i = 0; i < colorStops.length; i++) gradient.addColorStop(colorStops[i].offset, colorStops[i].color);
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();
}
/**
 * Add a source-over path fill layer. tracePath should emit subpaths on ctx; return true to fill.
 * @returns {boolean} whether fill ran
 */
export function addMaskPathFill(ctx, fillStyle, tracePath) {
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = fillStyle;
    ctx.beginPath();
    if (!tracePath(ctx)) return false;
    ctx.fill();
    return true;
}
/** Clip current pixels to maskCanvas alpha (destination-in). */
export function maskCanvasDestinationIn(ctx, maskCanvas, width, height) {
    ctx.globalCompositeOperation = "destination-in";
    ctx.drawImage(maskCanvas, 0, 0, width, height);
}
/** Copy sourceCanvas then keep only pixels covered by maskCanvas. */
export function composeDestinationIn(sourceCanvas, maskCanvas) {
    const w = sourceCanvas.width;
    const h = sourceCanvas.height;
    const out = createOffscreenCanvas(w, h);
    const ctx = out.getContext("2d");
    ctx.drawImage(sourceCanvas, 0, 0);
    maskCanvasDestinationIn(ctx, maskCanvas, w, h);
    return out;
}
/** Blit a finished mask buffer onto the scene (source-over, identity transform). */
export function blitMaskOverlay(ctx, sourceCanvas) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.drawImage(sourceCanvas, 0, 0);
    ctx.restore();
}
export class SpriteCache {
    constructor() {
        this.cache = new Map();
    }
    get(key, generateFn, ...args) {
        let sprite = this.cache.get(key);
        if (!sprite) {
            sprite = generateFn(...args);
            this.cache.set(key, sprite);
        }
        return sprite;
    }
    clear() {
        this.cache.clear();
    }
}
/**
 * Dispose a cache entry's canvas/bitmap handle correctly.
 * ImageBitmaps must be explicitly closed; OffscreenCanvases go back to the pool.
 * @param {object} entry
 */
function disposeEntry(entry) {
    entry.disposed = true;
    if (entry._isBitmap) entry.canvas.close();
    else releaseOffscreenCanvas(entry.canvas);
}
/**
 * LRU cache of offscreen canvas sprites (bake once, blit many).
 * Entries are asynchronously promoted to GPU-resident ImageBitmap after the
 * first bake, so subsequent blits avoid per-frame texture uploads.
 *
 * @param {{ maxItems?: number }} [options]
 */
export function createBakedSpriteCache({ maxItems = 2000 } = {}) {
    const cache = new LruMap(maxItems, {
        onEvict: (key, entry) => {
            disposeEntry(entry);
        },
    });
    return {
        maxItems,
        cache,
        get(key) {
            return cache.get(key) ?? null;
        },
        /**
         * @param {string} key
         * @param {OffscreenCanvas | HTMLCanvasElement} sourceCanvas
         * @param {Record<string, unknown>} [meta]
         */
        set(key, sourceCanvas, meta = {}) {
            const existing = cache.peek(key);
            if (existing) disposeEntry(existing);
            const bakeScale = meta.bakeScale ?? 1;
            const entry = { canvas: sourceCanvas, _isBitmap: false, bakeScale, anchorX: meta.anchorX ?? 0, anchorY: meta.anchorY ?? 0, drawW: sourceCanvas.width / bakeScale, drawH: sourceCanvas.height / bakeScale, ...meta };
            cache.set(key, entry);
            // Asynchronously promote to a GPU-resident ImageBitmap so that
            // subsequent ctx.drawImage calls are zero-copy.
            createImageBitmap(sourceCanvas)
                .then((bitmap) => {
                    if (entry.disposed) {
                        bitmap.close();
                        return;
                    }
                    // Only apply if this entry is still the live one in the cache.
                    const live = cache.get(key);
                    if (live === entry) {
                        entry.canvas = bitmap;
                        entry._isBitmap = true;
                        // The OffscreenCanvas is no longer needed — return it to the pool.
                        releaseOffscreenCanvas(sourceCanvas);
                    } else
                        // Entry was already evicted or replaced; discard the bitmap.
                        bitmap.close();
                })
                .catch(() => {
                    // Promotion failed (e.g. canvas was closed). Keep OffscreenCanvas as-is.
                });
            return entry;
        },
        clear() {
            for (const entry of cache.values()) disposeEntry(entry);
            cache.clear();
        },
    };
}
const SPRITE_VIEW_STEP = 30;
const SPRITE_VIEW_LIMIT = 120;
function packQuantizedViewBucket(dx, dy, step = SPRITE_VIEW_STEP, limit = SPRITE_VIEW_LIMIT) {
    const clampedX = dx < -limit ? -limit : dx > limit ? limit : dx;
    const clampedY = dy < -limit ? -limit : dy > limit ? limit : dy;
    const keyDx = Math.round(clampedX / step);
    const keyDy = Math.round(clampedY / step);
    return ((keyDx + 32) << 6) | (keyDy + 32);
}
function quantizedViewAxisOffset(offset, step = SPRITE_VIEW_STEP, limit = SPRITE_VIEW_LIMIT) {
    const clamped = offset < -limit ? -limit : offset > limit ? limit : offset;
    return Math.round(clamped / step) * step;
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
/**
 * LRU baked-sprite cache with shared viewer-offset quantization.
 * Radial-elevation props use this; domain key/bake helpers live below.
 *
 * @param {{ maxItems?: number }} [options]
 */
function createQuantizedSpriteCache({ maxItems = 2000 } = {}) {
    const baked = createBakedSpriteCache({ maxItems });
    const initialMaxItems = maxItems;
    const telemetry = { requests: 0, misses: 0, evictions: 0 };
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
            const cached = baked.get(key);
            if (!cached) this.telemetry.misses++;
            // Evaluate cache pressure every 2000 requests.
            // Grow the LRU only when the miss rate is high (>20%) AND we are still
            // evicting entries — that combination reliably indicates the working set
            // is genuinely larger than the current capacity.
            // Hard cap at 4× the initial size so a pathological working set cannot
            // exhaust GPU memory with unbounded ImageBitmap accumulation.
            if (this.telemetry.requests >= 2000) {
                const missRate = this.telemetry.misses / this.telemetry.requests;
                if (this.telemetry.evictions > 0 && missRate > 0.2) {
                    const cap = initialMaxItems * 4;
                    if (baked.cache.maxSize < cap) {
                        baked.cache.maxSize = Math.min(cap, Math.ceil(baked.cache.maxSize * 1.5));
                        this.maxItems = baked.cache.maxSize;
                    }
                }
                this.telemetry.requests = 0;
                this.telemetry.misses = 0;
                this.telemetry.evictions = 0;
            }
            if (cached) return cached;
            const result = bakeFn();
            if (result instanceof OffscreenCanvas || (typeof HTMLCanvasElement !== "undefined" && result instanceof HTMLCanvasElement)) return baked.set(key, result, { drawRatio: result.drawRatio, verticalShift: result.verticalShift });
            const { canvas, meta = {} } = result;
            return baked.set(key, canvas, meta);
        },
        clear() {
            baked.clear();
        },
    };
}
export function blitAnchoredSprite(ctx, sprite, worldX, worldY, modifier = null, frameIndex = 0) {
    const bakeScale = sprite.bakeScale ?? 1;
    const anchorX = sprite.anchorX ?? 0;
    const anchorY = sprite.anchorY ?? 0;
    const canvas = sprite.canvas ?? sprite;
    const frameCount = sprite.frameCount ?? 1;
    const frameWidthCanvas = sprite.frameWidthCanvas ?? canvas.width / frameCount;
    const drawW = sprite.drawW ?? (frameCount > 1 ? frameWidthCanvas / bakeScale : canvas.width / bakeScale);
    const drawH = sprite.drawH ?? canvas.height / bakeScale;
    const destX = worldX - anchorX;
    const destY = worldY - anchorY;
    const sx = frameCount > 1 ? (frameIndex % frameCount) * frameWidthCanvas : 0;
    const sw = frameCount > 1 ? frameWidthCanvas : canvas.width;
    const sh = canvas.height;
    // Fast path for 99% of sprites that have no modifier — avoid any optional-chain reads.
    if (!modifier) {
        ctx.drawImage(canvas, sx, 0, sw, sh, destX, destY, drawW, drawH);
        return;
    }
    const drawX = modifier.drawX ?? worldX;
    const drawY = modifier.drawY ?? worldY;
    const scale = modifier.scale ?? 1;
    if (modifier.clipCircle) {
        ctx.save();
        prepModifiedBlit(ctx, modifier);
        ctx.drawImage(canvas, sx, 0, sw, sh, drawX - anchorX * scale, drawY - anchorY * scale, drawW * scale, drawH * scale);
        ctx.restore();
        return;
    }
    if (modifier.alpha != null) {
        const prevAlpha = ctx.globalAlpha;
        ctx.globalAlpha = prevAlpha * modifier.alpha;
        ctx.drawImage(canvas, sx, 0, sw, sh, drawX - anchorX * scale, drawY - anchorY * scale, drawW * scale, drawH * scale);
        ctx.globalAlpha = prevAlpha;
        return;
    }
    ctx.drawImage(canvas, sx, 0, sw, sh, drawX - anchorX * scale, drawY - anchorY * scale, drawW * scale, drawH * scale);
}
// ─── Radial elevation prop preset ────────────────────────────────────────────
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
function getPropStaticKey(prop, renderKey) {
    const facing = entityFacing(prop);
    const voKey = visualOverrideCacheKey(prop);
    const attachmentKey = getVisualAttachmentSpriteCacheKey(prop, { quantizeAngleIndex });
    const rolls = !!prop.strategy?.rolls;
    const rollKey = rolls ? buildRollOrientKey(prop.rollQuat, resolvePropQuantizeSteps(prop).facing) : "";
    const physicsKey = getBaseSpriteCacheKey(prop, PROP_SPRITE_KEY_DEPS);
    if (prop._staticKeyFacing === facing && prop._staticKeyVo === voKey && prop._staticKeyAttachment === attachmentKey && prop._staticKeyPhysicsKey === physicsKey && (!rolls || prop._staticKeyRoll === rollKey) && prop._cachedStaticKey !== undefined) return prop._cachedStaticKey;
    const k1 = BigInt(internSpriteKeyPart(renderKey));
    const customKey = prop.strategy?.getCustomSpriteCacheKey?.(prop) ?? prop.getCustomSpriteCacheKey?.(prop) ?? "";
    const k2 = BigInt(internSpriteKeyPart(customKey));
    const k3 = BigInt(internSpriteKeyPart(physicsKey));
    const k4 = BigInt(internSpriteKeyPart(attachmentKey));
    const staticKey = (k1 << 60n) | (k2 << 40n) | (k3 << 20n) | k4;
    prop._staticKeyFacing = facing;
    prop._staticKeyVo = voKey;
    prop._staticKeyAttachment = attachmentKey;
    prop._staticKeyPhysicsKey = physicsKey;
    if (rolls) prop._staticKeyRoll = rollKey;
    prop._cachedStaticKey = staticKey;
    return staticKey;
}
/**
 * @param {object} prop
 * @param {import("../Viewport/Viewport.js").Viewport} viewport
 * @param {string} renderKey
 * @param {(ctx: CanvasRenderingContext2D, prop: object, viewport: import("../Viewport/Viewport.js").Viewport) => void} draw
 * @param {number} [animFrame]
 */
function getOrBakePropSprite(prop, viewport, renderKey, draw, animFrame = 0) {
    const px = viewport.x;
    const py = viewport.y;
    const zoom = viewport.zoom ?? 1;
    const dx = prop.x - px;
    const dy = prop.y - py;
    const viewStep = resolvePropQuantizeSteps(prop).view;
    const pixelSize = resolvePropPixelSizeForProp(prop);
    const staticKey = getPropStaticKey(prop, renderKey);
    let key = staticKey;
    key = (key << 12n) | BigInt(packQuantizedViewBucket(dx, dy, viewStep));
    key = (key << 16n) | BigInt(animFrame & 0xffff);
    key = (key << 16n) | BigInt((pixelSize ?? 0) & 0xffff);
    key = (key << 16n) | BigInt(packZoomKeyBucket(zoom) & 0xffff);
    return propSpriteCache.getOrBake(key, () => {
        const qDx = quantizedViewAxisOffset(dx, viewStep);
        const qDy = quantizedViewAxisOffset(dy, viewStep);
        const parentFacing = quantizeAngle(entityFacing(prop), resolvePropQuantizeSteps(prop).facing);
        propFootprintHalfExtentsInto(ENGINE_F32, M_VEC_A, prop);
        const baseR = Math.max(resolveBodyRadius(prop), ENGINE_F32[M_VEC_A], ENGINE_F32[M_VEC_A + 1]);
        const stageR = Math.max(baseR, resolveVisualAttachmentBakeRadius(prop, parentFacing));
        const worldDiameter = stageR * 2;
        const bakeScale = resolvePropBakeScaleForProp(prop, worldDiameter, zoom);
        const stageSpan = Math.ceil((stageR * 2.6 + PROP_STAGE_PADDING * 2) * bakeScale);
        const anchorX = PROP_STAGE_PADDING + stageR * 1.3;
        const anchorY = PROP_STAGE_PADDING + stageR * 1.3;
        const canvas = acquireOffscreenCanvas(stageSpan, stageSpan);
        const ctx = canvas.getContext("2d");
        const stageProp = getPropStageBakeState(prop);
        stageProp.radius = resolveBodyRadius(prop);
        const attachments = resolveVisualAttachmentProps(stageProp);
        ctx.save();
        if (bakeScale !== 1) ctx.scale(bakeScale, bakeScale);
        ctx.translate(anchorX - prop.x, anchorY - prop.y);
        drawVisualAttachmentList(ctx, attachments.before, viewport);
        draw(ctx, stageProp, viewport);
        drawVisualAttachmentList(ctx, attachments.after, viewport);
        ctx.restore();
        return { canvas, meta: { anchorX, anchorY, bakeScale } };
    });
}
export function clearPropSpriteCache() {
    propSpriteCache.clear();
    overlaySpriteCache.clear();
    gridStampSpriteCache.clear();
    clearSpriteKeyIntern();
}
/** QuantizedSpriteCache render keys for grid-stamped occupancy (not WorldProp assets). */
export const GRID_STAMP_RENDER_KEY = { FloorBelt: "grid_floor_belt", Portal: "grid_portal" };
export const BELT_FILMSTRIP_FRAMES = 8;
export const BELT_FRAME_MS = 60;
const GRID_STAMP_STAGE_PADDING = 40;
const gridStampSpriteCache = createQuantizedSpriteCache({ maxItems: 512 });
function buildSharedGridStampFilmstripKey(renderKey, stripKey, zoom, pixelSize) {
    let key = BigInt(internSpriteKeyPart(renderKey));
    key = (key << 20n) | BigInt(internSpriteKeyPart(stripKey));
    key = (key << 16n) | BigInt((pixelSize ?? 0) & 0xffff);
    key = (key << 16n) | BigInt(packZoomKeyBucket(zoom) & 0xffff);
    return key;
}
function getOrBakeSharedGridStampFilmstrip(viewport, renderKey, stripKey, halfExtents, facing, draw, frameCount) {
    const zoom = viewport.zoom ?? 1;
    const stageR = halfExtents.x;
    const worldDiameter = stageR * 2;
    const pixelSize = Math.round(worldDiameter * zoom);
    const key = buildSharedGridStampFilmstripKey(renderKey, stripKey, zoom, pixelSize);
    return gridStampSpriteCache.getOrBake(key, () => {
        const bakeScale = resolvePropBakeScale(worldDiameter, undefined, false, zoom);
        const frameSpan = Math.ceil((stageR * 2.6 + GRID_STAMP_STAGE_PADDING * 2) * bakeScale);
        const anchorX = GRID_STAMP_STAGE_PADDING + stageR * 1.3;
        const anchorY = GRID_STAMP_STAGE_PADDING + stageR * 1.3;
        const canvas = acquireOffscreenCanvas(frameSpan * frameCount, frameSpan);
        const bakeCtx = canvas.getContext("2d");
        const stageProp = { x: 0, y: 0, facing: quantizeAngle(facing ?? 0, 4), halfExtents, radius: stageR };
        for (let f = 0; f < frameCount; f++) {
            stageProp.ageMs = f * BELT_FRAME_MS;
            bakeCtx.save();
            bakeCtx.translate(f * frameSpan, 0);
            if (bakeScale !== 1) bakeCtx.scale(bakeScale, bakeScale);
            bakeCtx.translate(anchorX, anchorY);
            draw(bakeCtx, stageProp, viewport);
            bakeCtx.restore();
        }
        return { canvas, meta: { anchorX, anchorY, bakeScale, frameCount, frameWidthCanvas: frameSpan, drawW: frameSpan / bakeScale, drawH: frameSpan / bakeScale } };
    });
}
export function hasSharedGridStampFilmstrip(renderKey, stripKey, halfExtents, zoom) {
    const pixelSize = Math.round(halfExtents.x * 2 * (zoom ?? 1));
    const key = buildSharedGridStampFilmstripKey(renderKey, stripKey, zoom ?? 1, pixelSize);
    return gridStampSpriteCache.get(key) != null;
}
export function warmSharedGridStampFilmstripCache(viewport, cellHalf, renderKey, packedList, packedCount, flowAngleForPacked, drawForPacked, frameCount = BELT_FILMSTRIP_FRAMES) {
    const halfExtents = { x: cellHalf, y: cellHalf };
    const zoom = viewport.zoom ?? 1;
    for (let i = 0; i < packedCount; i++) {
        const packed = packedList[i];
        const stripKey = `p${packed}`;
        const facing = flowAngleForPacked(packed);
        const pixelSize = Math.round(cellHalf * 2 * zoom);
        const key = buildSharedGridStampFilmstripKey(renderKey, stripKey, zoom, pixelSize);
        if (gridStampSpriteCache.get(key)) continue;
        getOrBakeSharedGridStampFilmstrip(viewport, renderKey, stripKey, halfExtents, facing, drawForPacked(packed), frameCount);
    }
}
export function drawCachedGridStampFilmstripShared(ctx, worldX, worldY, halfExtents, viewport, renderKey, stripKey, facing, draw, frameIndex, frameCount) {
    const sprite = getOrBakeSharedGridStampFilmstrip(viewport, renderKey, stripKey, halfExtents, facing, draw, frameCount);
    blitAnchoredSprite(ctx, sprite, worldX, worldY, null, frameIndex);
}
/** Render keys for baked sandbox/editor overlay glyphs. */
export const OVERLAY_RENDER_KEY = { SelectionRing: "overlay_selection_ring", PathDestination: "overlay_path_destination", PathArrowHead: "overlay_path_arrow_head", FlowDirectionArrow: "overlay_flow_direction_arrow", WireEndpoint: "overlay_wire_endpoint", GridCellHighlight: "overlay_grid_cell_highlight", PathDebugNode: "overlay_path_debug_node" };
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
        const anchorX = worldSpan / 2 + OVERLAY_STAGE_PADDING;
        const anchorY = worldSpan / 2 + OVERLAY_STAGE_PADDING;
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
 * Mandatory draw path for grid stamps and world props (except 3D building walls).
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} prop
 * @param {import("../Viewport/Viewport.js").Viewport} viewport
 * @param {string} renderKey
 * @param {PropDrawRecipe} draw
 * @param {number} [animFrame]
 */
export function drawCachedPropSprite(ctx, prop, viewport, renderKey, draw, animFrame = 0) {
    const sprite = getOrBakePropSprite(prop, viewport, renderKey, draw, animFrame);
    const modifier = resolveSpriteDrawModifier(prop, viewport.x, viewport.y);
    blitAnchoredSprite(ctx, sprite, prop.x, prop.y, modifier);
}
/**
 * Post-bake draw transforms (alpha, clip, scale, position).
 * Applied at ctx.drawImage time — never in quantized sprite cache keys.
 *
 * @typedef {{
 *   alpha?: number,
 *   scale?: number,
 *   clipCircle?: { cx: number, cy: number, r: number },
 *   drawX?: number,
 *   drawY?: number,
 * }} SpriteDrawModifier
 */
/** @param {object} entity @param {number} px @param {number} py @returns {SpriteDrawModifier | null} */
export function resolveSpriteDrawModifier(entity, px, py) {
    const fn = entity.currentState?.resolveSpriteDrawModifier;
    if (!fn) return null;
    return fn.call(entity.currentState, entity, px, py);
}
/** @param {CanvasRenderingContext2D} ctx @param {SpriteDrawModifier | null | undefined} modifier */
export function prepModifiedBlit(ctx, modifier) {
    if (!modifier) return;
    if (modifier.clipCircle) {
        const { cx, cy, r } = modifier.clipCircle;
        clipToPath(ctx, (ctx) => {
            traceCircle(ctx, cx, cy, r);
        });
    }
    if (modifier.alpha != null) ctx.globalAlpha *= modifier.alpha;
}
