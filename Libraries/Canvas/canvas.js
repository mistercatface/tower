import { WORLD_SURFACE_DEFAULTS } from "../../Config/world.js";
import { quantizeAngle, quantizeAngleIndex } from "../Math/math.js";
import { ENGINE_F32, ENGINE_I32, M_VEC_A, propSpriteCacheSlab, gridStampSpriteCacheSlab, overlaySpriteCacheSlab, I_SPRITE_KEY_LO, I_SPRITE_KEY_HI, R_SPRITE_BAKE_SCALE, R_SPRITE_ANCHOR_X, R_SPRITE_ANCHOR_Y, R_SPRITE_DRAW_W, R_SPRITE_DRAW_H, R_SPRITE_FRAME_COUNT, R_SPRITE_FRAME_WIDTH } from "../../Core/engineMemory.js";
import { SPRITE_CACHE_FLAG_LIVE, SPRITE_CACHE_FLAG_BITMAP, OVERLAY_RENDER_KEY_FLOATING_TEXT } from "../../Core/engineEnums.js";
import { packRollOrientId, readEntityFacing } from "../Physics/physics.js";
import { resolvePropBakeScaleForProp, resolvePropPixelSizeForProp, quantizePropBakeZoom, resolvePropBakeScale } from "../../Core/GamePropPixelSize.js";
import { resolvePropQuantizeSteps, getBaseSpriteCacheId, getPropStageBakeState, propFootprintHalfExtentsInto, getVisualAttachmentSpriteCacheId, resolveVisualAttachmentBakeRadius, resolveVisualAttachmentProps } from "../Props/props.js";
import { visualOverrideCacheId } from "../Color/visualOverride.js";
import propCatalog, { NEXT_RENDER_KEY_ID } from "../../Assets/props/index.js";
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
function disposeSpriteSlot(slab, slot) {
    const handle = slab.handles[slot];
    const flags = slab.flags[slot];
    slab.slotGen[slot] = (slab.slotGen[slot] + 1) >>> 0 || 1;
    slab.flags[slot] = 0;
    slab.handles[slot] = null;
    slab.keys[slot] = null;
    if (!handle) return;
    if (flags & SPRITE_CACHE_FLAG_BITMAP) handle.close();
    else releaseOffscreenCanvas(handle);
}
function spriteCacheKeyParts(key) {
    if (typeof key === "bigint") {
        let lo = 0;
        let hi = 0;
        let k = key < 0n ? -key : key;
        lo = Number(k & 0xffffffffn) >>> 0;
        k >>= 32n;
        hi = Number(k & 0xffffffffn) >>> 0;
        k >>= 32n;
        while (k > 0n) {
            lo ^= Number(k & 0xffffffffn) >>> 0;
            lo = Math.imul(lo, 16777619) >>> 0;
            k >>= 32n;
        }
        ENGINE_I32[I_SPRITE_KEY_LO] = lo;
        ENGINE_I32[I_SPRITE_KEY_HI] = hi;
        return;
    }
    const s = String(key);
    let lo = 2166136261;
    let hi = 2166136261 ^ 0x9e3779b9;
    for (let i = 0; i < s.length; i++) {
        const c = s.charCodeAt(i);
        lo ^= c;
        lo = Math.imul(lo, 16777619) >>> 0;
        hi ^= c;
        hi = Math.imul(hi, 2246822519) >>> 0;
    }
    ENGINE_I32[I_SPRITE_KEY_LO] = lo;
    ENGINE_I32[I_SPRITE_KEY_HI] = hi;
}
function spriteCacheHashIndex(slab, lo, hi) {
    return ((lo ^ Math.imul(hi, 0x9e3779b1)) >>> 0) & (slab.hashCap - 1);
}
function spriteCacheLruUnlink(slab, slot) {
    const prev = slab.lruPrev[slot];
    const next = slab.lruNext[slot];
    if (prev >= 0) slab.lruNext[prev] = next;
    else slab.lruHead = next;
    if (next >= 0) slab.lruPrev[next] = prev;
    else slab.lruTail = prev;
    slab.lruPrev[slot] = -1;
    slab.lruNext[slot] = -1;
}
function spriteCacheLruAppend(slab, slot) {
    const tail = slab.lruTail;
    slab.lruPrev[slot] = tail;
    slab.lruNext[slot] = -1;
    if (tail >= 0) slab.lruNext[tail] = slot;
    else slab.lruHead = slot;
    slab.lruTail = slot;
}
function spriteCacheLruTouch(slab, slot) {
    if (slab.lruTail === slot) return;
    spriteCacheLruUnlink(slab, slot);
    spriteCacheLruAppend(slab, slot);
}
function circularProbeContains(ideal, mid, end, cap) {
    if (ideal <= end) return mid >= ideal && mid < end;
    return mid >= ideal || mid < end;
}
function spriteCacheHashRemove(slab, slot) {
    const lo = slab.keyLo[slot];
    const hi = slab.keyHi[slot];
    let idx = spriteCacheHashIndex(slab, lo, hi);
    const cap = slab.hashCap;
    let hole = -1;
    for (let probe = 0; probe < cap; probe++) {
        const at = slab.hashTable[idx];
        if (at === -1) return;
        if (at === slot) {
            hole = idx;
            break;
        }
        idx = (idx + 1) & (cap - 1);
    }
    if (hole < 0) return;
    let i = hole;
    for (;;) {
        i = (i + 1) & (cap - 1);
        const s = slab.hashTable[i];
        if (s === -1) {
            slab.hashTable[hole] = -1;
            return;
        }
        const ideal = spriteCacheHashIndex(slab, slab.keyLo[s], slab.keyHi[s]);
        if (!circularProbeContains(ideal, hole, i, cap)) continue;
        slab.hashTable[hole] = s;
        hole = i;
    }
}
function spriteCacheHashInsert(slab, slot) {
    let idx = spriteCacheHashIndex(slab, slab.keyLo[slot], slab.keyHi[slot]);
    const cap = slab.hashCap;
    for (let probe = 0; probe < cap; probe++) {
        if (slab.hashTable[idx] < 0) {
            slab.hashTable[idx] = slot;
            return;
        }
        idx = (idx + 1) & (cap - 1);
    }
    throw new Error("spriteCacheHashInsert: hash table full");
}
function spriteCacheFindSlot(slab, key, lo, hi) {
    let idx = spriteCacheHashIndex(slab, lo, hi);
    const cap = slab.hashCap;
    for (let probe = 0; probe < cap; probe++) {
        const at = slab.hashTable[idx];
        if (at === -1) return -1;
        if (at >= 0 && slab.keys[at] === key && slab.flags[at] & SPRITE_CACHE_FLAG_LIVE) return at;
        idx = (idx + 1) & (cap - 1);
    }
    return -1;
}
function spriteCacheEvictHead(slab) {
    const slot = slab.lruHead;
    if (slot < 0) return;
    spriteCacheHashRemove(slab, slot);
    spriteCacheLruUnlink(slab, slot);
    disposeSpriteSlot(slab, slot);
    slab.freeSlots[slab.freeCount++] = slot;
    slab.liveCount--;
}
// Walls/ground use page atlases in WorldSurface. Prop/grid/overlay sprites are per-key SoA slots (not shared pages).
export class SpriteCacheSlab {
    get(key) {
        spriteCacheKeyParts(key);
        const lo = ENGINE_I32[I_SPRITE_KEY_LO] >>> 0;
        const hi = ENGINE_I32[I_SPRITE_KEY_HI] >>> 0;
        const slot = spriteCacheFindSlot(this, key, lo, hi);
        if (slot < 0) return -1;
        spriteCacheLruTouch(this, slot);
        return slot;
    }
    has(key) {
        spriteCacheKeyParts(key);
        const lo = ENGINE_I32[I_SPRITE_KEY_LO] >>> 0;
        const hi = ENGINE_I32[I_SPRITE_KEY_HI] >>> 0;
        return spriteCacheFindSlot(this, key, lo, hi) >= 0;
    }
    set(key, sourceCanvas, bakeScale, anchorX, anchorY, drawW, drawH, frameCount, frameWidthCanvas) {
        spriteCacheKeyParts(key);
        const lo = ENGINE_I32[I_SPRITE_KEY_LO] >>> 0;
        const hi = ENGINE_I32[I_SPRITE_KEY_HI] >>> 0;
        const existing = spriteCacheFindSlot(this, key, lo, hi);
        if (existing >= 0) {
            spriteCacheHashRemove(this, existing);
            spriteCacheLruUnlink(this, existing);
            disposeSpriteSlot(this, existing);
            this.freeSlots[this.freeCount++] = existing;
            this.liveCount--;
        }
        while (this.liveCount >= this.maxLive) spriteCacheEvictHead(this);
        if (this.freeCount <= 0) throw new Error("SpriteCacheSlab.set: capacity exceeded");
        const slot = this.freeSlots[--this.freeCount];
        const scale = bakeScale ?? 1;
        const gen = (this.slotGen[slot] + 1) >>> 0 || 1;
        this.slotGen[slot] = gen;
        this.keys[slot] = key;
        this.keyLo[slot] = lo;
        this.keyHi[slot] = hi;
        this.handles[slot] = sourceCanvas;
        this.bakeScale[slot] = scale;
        this.anchorX[slot] = anchorX ?? 0;
        this.anchorY[slot] = anchorY ?? 0;
        this.drawW[slot] = drawW ?? sourceCanvas.width / scale;
        this.drawH[slot] = drawH ?? sourceCanvas.height / scale;
        this.frameCount[slot] = frameCount ?? 1;
        this.frameWidthCanvas[slot] = frameWidthCanvas ?? (frameCount > 1 ? sourceCanvas.width / frameCount : sourceCanvas.width);
        this.flags[slot] = SPRITE_CACHE_FLAG_LIVE;
        spriteCacheHashInsert(this, slot);
        spriteCacheLruAppend(this, slot);
        this.liveCount++;
        createImageBitmap(sourceCanvas)
            .then((bitmap) => {
                if (!(this.flags[slot] & SPRITE_CACHE_FLAG_LIVE) || this.slotGen[slot] !== gen || this.keys[slot] !== key) {
                    bitmap.close();
                    return;
                }
                const prev = this.handles[slot];
                this.handles[slot] = bitmap;
                this.flags[slot] = SPRITE_CACHE_FLAG_LIVE | SPRITE_CACHE_FLAG_BITMAP;
                if (prev && prev !== bitmap) releaseOffscreenCanvas(prev);
            })
            .catch(() => {});
        return slot;
    }
    clear() {
        let slot = this.lruHead;
        while (slot >= 0) {
            const next = this.lruNext[slot];
            disposeSpriteSlot(this, slot);
            slot = next;
        }
        this.lruHead = -1;
        this.lruTail = -1;
        this.liveCount = 0;
        this.freeCount = 0;
        for (let i = 0; i < this.capacity; i++) {
            this.freeSlots[this.freeCount++] = this.capacity - 1 - i;
            this.lruPrev[i] = -1;
            this.lruNext[i] = -1;
        }
        this.hashTable.fill(-1);
    }
    getOrBake(key, bakeFn) {
        let slot = this.get(key);
        if (slot >= 0) return slot;
        const canvas = bakeFn();
        return this.set(key, canvas, ENGINE_F32[R_SPRITE_BAKE_SCALE], ENGINE_F32[R_SPRITE_ANCHOR_X], ENGINE_F32[R_SPRITE_ANCHOR_Y], ENGINE_F32[R_SPRITE_DRAW_W], ENGINE_F32[R_SPRITE_DRAW_H], ENGINE_F32[R_SPRITE_FRAME_COUNT] | 0, ENGINE_F32[R_SPRITE_FRAME_WIDTH] | 0);
    }
}
function writeSpriteBakeOuts(bakeScale, anchorX, anchorY, drawW, drawH, frameCount, frameWidthCanvas) {
    ENGINE_F32[R_SPRITE_BAKE_SCALE] = bakeScale;
    ENGINE_F32[R_SPRITE_ANCHOR_X] = anchorX;
    ENGINE_F32[R_SPRITE_ANCHOR_Y] = anchorY;
    ENGINE_F32[R_SPRITE_DRAW_W] = drawW;
    ENGINE_F32[R_SPRITE_DRAW_H] = drawH;
    ENGINE_F32[R_SPRITE_FRAME_COUNT] = frameCount;
    ENGINE_F32[R_SPRITE_FRAME_WIDTH] = frameWidthCanvas;
}
Object.setPrototypeOf(propSpriteCacheSlab, SpriteCacheSlab.prototype);
Object.setPrototypeOf(gridStampSpriteCacheSlab, SpriteCacheSlab.prototype);
Object.setPrototypeOf(overlaySpriteCacheSlab, SpriteCacheSlab.prototype);
const SPRITE_VIEW_STEP = 30;
const SPRITE_VIEW_LIMIT = 120;
function packQuantizedViewBucket(dx, dy, step = SPRITE_VIEW_STEP, limit = SPRITE_VIEW_LIMIT) {
    const clampedX = dx < -limit ? -limit : dx > limit ? limit : dx;
    const clampedY = dy < -limit ? -limit : dy > limit ? limit : dy;
    const keyDx = Math.round(clampedX / step);
    const keyDy = Math.round(clampedY / step);
    return ((keyDx + 32) << 6) | (keyDy + 32);
}
const SPRITE_KEY_PART_MASK = 0xfffff;
const spriteKeyIntern = new Map();
let spriteKeyInternNext = 1;
function internSpriteKeyPart(part) {
    if (!part) return 0;
    if (typeof part === "number") return part & SPRITE_KEY_PART_MASK;
    let id = spriteKeyIntern.get(part);
    if (id === undefined) {
        id = spriteKeyInternNext++;
        if (spriteKeyInternNext > SPRITE_KEY_PART_MASK) throw new Error("sprite key intern table overflow");
        spriteKeyIntern.set(part, id);
    }
    return id;
}
function clearSpriteKeyIntern() {
    spriteKeyIntern.clear();
    spriteKeyInternNext = 1;
}
function hashSpriteKeyString(s) {
    if (!s) return 0;
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return (h >>> 0) & SPRITE_KEY_PART_MASK;
}
let nextExtraRenderKeyId = NEXT_RENDER_KEY_ID;
const extraRenderKeyIds = new Map();
function resolveRenderKeyId(renderKey) {
    if (typeof renderKey === "number") return renderKey & SPRITE_KEY_PART_MASK;
    const asset = propCatalog[renderKey];
    if (asset?.renderKeyId) return asset.renderKeyId & SPRITE_KEY_PART_MASK;
    let id = extraRenderKeyIds.get(renderKey);
    if (id === undefined) {
        id = nextExtraRenderKeyId++;
        if (id > SPRITE_KEY_PART_MASK) throw new Error("render key id overflow");
        extraRenderKeyIds.set(renderKey, id);
    }
    return id;
}
function packZoomKeyBucket(zoom) {
    return Math.round(quantizePropBakeZoom(zoom) * 8);
}
const PROP_SPRITE_KEY_DEPS = { quantizeAngleIndex };
export function blitAnchoredSprite(ctx, slab, slot, worldX, worldY, frameIndex = 0, alpha = 1, scale = 1) {
    const anchorX = slab.anchorX[slot];
    const anchorY = slab.anchorY[slot];
    const canvas = slab.handles[slot];
    const frameCount = slab.frameCount[slot];
    const frameWidthCanvas = slab.frameWidthCanvas[slot];
    const drawW = slab.drawW[slot] * scale;
    const drawH = slab.drawH[slot] * scale;
    const destX = worldX - anchorX * scale;
    const destY = worldY - anchorY * scale;
    const sx = frameCount > 1 ? (frameIndex % frameCount) * frameWidthCanvas : 0;
    const sw = frameCount > 1 ? frameWidthCanvas : canvas.width;
    const sh = canvas.height;
    if (alpha === 1) {
        ctx.drawImage(canvas, sx, 0, sw, sh, destX, destY, drawW, drawH);
        return;
    }
    const prevAlpha = ctx.globalAlpha;
    ctx.globalAlpha = prevAlpha * alpha;
    ctx.drawImage(canvas, sx, 0, sw, sh, destX, destY, drawW, drawH);
    ctx.globalAlpha = prevAlpha;
}
const PROP_STAGE_PADDING = 40;
function drawVisualAttachmentList(ctx, attachments, viewport, flatPresentation) {
    for (let i = 0; i < attachments.length; i++) {
        const child = attachments[i];
        const childRenderKey = child.getRender3DKey?.() ?? child.strategy?.render3DKey;
        const childDraw = propCatalog[childRenderKey]?.drawRecipe;
        if (childDraw) childDraw(ctx, child, viewport, flatPresentation);
    }
}
export function getPropStaticKey(prop, renderKey) {
    const facing = readEntityFacing(prop);
    const voId = visualOverrideCacheId(prop);
    const attachmentId = getVisualAttachmentSpriteCacheId(prop, PROP_SPRITE_KEY_DEPS);
    const rolls = !!prop.strategy?.rolls;
    const rollId = rolls ? packRollOrientId(prop, resolvePropQuantizeSteps(prop).facing) : 0;
    const physicsId = getBaseSpriteCacheId(prop, PROP_SPRITE_KEY_DEPS);
    const customKey = prop.strategy?.getCustomSpriteCacheKey?.(prop) ?? prop.getCustomSpriteCacheKey?.(prop) ?? "";
    const customId = typeof customKey === "number" ? customKey & SPRITE_KEY_PART_MASK : hashSpriteKeyString(customKey);
    if (prop._staticKeyFacing === facing && prop._staticKeyVo === voId && prop._staticKeyAttachment === attachmentId && prop._staticKeyPhysicsKey === physicsId && prop._staticKeyCustom === customId && (!rolls || prop._staticKeyRoll === rollId) && prop._cachedStaticKey !== undefined) return prop._cachedStaticKey;
    const k1 = BigInt(resolveRenderKeyId(renderKey));
    const k2 = BigInt(customId);
    const k3 = BigInt(physicsId & SPRITE_KEY_PART_MASK);
    const k4 = BigInt(attachmentId & SPRITE_KEY_PART_MASK);
    const staticKey = (k1 << 60n) | (k2 << 40n) | (k3 << 20n) | k4;
    prop._staticKeyFacing = facing;
    prop._staticKeyVo = voId;
    prop._staticKeyAttachment = attachmentId;
    prop._staticKeyPhysicsKey = physicsId;
    prop._staticKeyCustom = customId;
    if (rolls) prop._staticKeyRoll = rollId;
    prop._cachedStaticKey = staticKey;
    return staticKey;
}
function getOrBakePropSprite(prop, viewport, renderKey, draw, animFrame = 0, flatPresentation = false) {
    const px = viewport.x;
    const py = viewport.y;
    const zoom = viewport.zoom ?? 1;
    const dx = prop.x - px;
    const dy = prop.y - py;
    const viewStep = resolvePropQuantizeSteps(prop).view;
    const pixelSize = resolvePropPixelSizeForProp(prop);
    const staticKey = getPropStaticKey(prop, renderKey);
    let key = staticKey;
    key = (key << 12n) | BigInt(flatPresentation ? 0 : packQuantizedViewBucket(dx, dy, viewStep));
    key = (key << 16n) | BigInt(animFrame & 0xffff);
    key = (key << 16n) | BigInt((pixelSize ?? 0) & 0xffff);
    key = (key << 16n) | BigInt(packZoomKeyBucket(zoom) & 0xffff);
    key = (key << 1n) | BigInt(flatPresentation ? 1 : 0);
    return propSpriteCacheSlab.getOrBake(key, () => {
        const parentFacing = quantizeAngle(readEntityFacing(prop), resolvePropQuantizeSteps(prop).facing);
        propFootprintHalfExtentsInto(ENGINE_F32, M_VEC_A, prop);
        const baseR = Math.max(prop.radius, ENGINE_F32[M_VEC_A], ENGINE_F32[M_VEC_A + 1]);
        const stageR = Math.max(baseR, resolveVisualAttachmentBakeRadius(prop, parentFacing));
        const worldDiameter = stageR * 2;
        const bakeScale = resolvePropBakeScaleForProp(prop, worldDiameter, zoom);
        const stageSpan = Math.ceil((stageR * 2.6 + PROP_STAGE_PADDING * 2) * bakeScale);
        const anchorX = PROP_STAGE_PADDING + stageR * 1.3;
        const anchorY = PROP_STAGE_PADDING + stageR * 1.3;
        const canvas = acquireOffscreenCanvas(stageSpan, stageSpan);
        const ctx = canvas.getContext("2d");
        const stageProp = getPropStageBakeState(prop);
        stageProp.radius = prop.radius;
        const attachments = resolveVisualAttachmentProps(stageProp);
        ctx.save();
        if (bakeScale !== 1) ctx.scale(bakeScale, bakeScale);
        ctx.translate(anchorX - prop.x, anchorY - prop.y);
        drawVisualAttachmentList(ctx, attachments.before, viewport, flatPresentation);
        draw(ctx, stageProp, viewport, flatPresentation);
        drawVisualAttachmentList(ctx, attachments.after, viewport, flatPresentation);
        ctx.restore();
        writeSpriteBakeOuts(bakeScale, anchorX, anchorY, stageSpan / bakeScale, stageSpan / bakeScale, 1, stageSpan);
        return canvas;
    });
}
export function clearPropSpriteCache() {
    propSpriteCacheSlab.clear();
    overlaySpriteCacheSlab.clear();
    gridStampSpriteCacheSlab.clear();
    clearSpriteKeyIntern();
}
export const BELT_FILMSTRIP_FRAMES = 8;
export const BELT_FRAME_MS = 60;
const GRID_STAMP_STAGE_PADDING = 40;
function buildSharedGridStampFilmstripKey(renderKey, stripKey, zoom, pixelSize) {
    let key = BigInt(renderKey & SPRITE_KEY_PART_MASK);
    key = (key << 20n) | BigInt(stripKey & SPRITE_KEY_PART_MASK);
    key = (key << 16n) | BigInt((pixelSize ?? 0) & 0xffff);
    key = (key << 16n) | BigInt(packZoomKeyBucket(zoom) & 0xffff);
    return key;
}
function getOrBakeSharedGridStampFilmstrip(viewport, renderKey, stripKey, halfX, facing, draw, frameCount) {
    const zoom = viewport.zoom ?? 1;
    const stageR = halfX;
    const worldDiameter = stageR * 2;
    const pixelSize = Math.round(worldDiameter * zoom);
    const key = buildSharedGridStampFilmstripKey(renderKey, stripKey, zoom, pixelSize);
    return gridStampSpriteCacheSlab.getOrBake(key, () => {
        const bakeScale = resolvePropBakeScale(worldDiameter, undefined, false, zoom);
        const frameSpan = Math.ceil((stageR * 2.6 + GRID_STAMP_STAGE_PADDING * 2) * bakeScale);
        const anchorX = GRID_STAMP_STAGE_PADDING + stageR * 1.3;
        const anchorY = GRID_STAMP_STAGE_PADDING + stageR * 1.3;
        const canvas = acquireOffscreenCanvas(frameSpan * frameCount, frameSpan);
        const bakeCtx = canvas.getContext("2d");
        const bakeFacing = quantizeAngle(facing ?? 0, 4);
        for (let f = 0; f < frameCount; f++) {
            bakeCtx.save();
            bakeCtx.translate(f * frameSpan, 0);
            if (bakeScale !== 1) bakeCtx.scale(bakeScale, bakeScale);
            bakeCtx.translate(anchorX, anchorY);
            draw(bakeCtx, halfX, halfX, bakeFacing, f * BELT_FRAME_MS);
            bakeCtx.restore();
        }
        writeSpriteBakeOuts(bakeScale, anchorX, anchorY, frameSpan / bakeScale, frameSpan / bakeScale, frameCount, frameSpan);
        return canvas;
    });
}
export function warmSharedGridStampFilmstripCache(viewport, cellHalf, renderKey, packedList, packedCount, flowAngleForPacked, drawForPacked, frameCount = BELT_FILMSTRIP_FRAMES) {
    const zoom = viewport.zoom ?? 1;
    for (let i = 0; i < packedCount; i++) {
        const packed = packedList[i];
        const facing = flowAngleForPacked(packed);
        const pixelSize = Math.round(cellHalf * 2 * zoom);
        const key = buildSharedGridStampFilmstripKey(renderKey, packed, zoom, pixelSize);
        if (gridStampSpriteCacheSlab.has(key)) continue;
        getOrBakeSharedGridStampFilmstrip(viewport, renderKey, packed, cellHalf, facing, drawForPacked(packed), frameCount);
    }
}
export function drawCachedGridStampFilmstripShared(ctx, worldX, worldY, halfX, viewport, renderKey, stripKey, facing, draw, frameIndex, frameCount) {
    const slot = getOrBakeSharedGridStampFilmstrip(viewport, renderKey, stripKey, halfX, facing, draw, frameCount);
    blitAnchoredSprite(ctx, gridStampSpriteCacheSlab, slot, worldX, worldY, frameIndex);
}
const OVERLAY_STAGE_PADDING = 6;
export function drawCachedFloatingText(ctx, worldX, worldY, cacheKey, text, style, color, alpha, scale) {
    let key = BigInt(internSpriteKeyPart(OVERLAY_RENDER_KEY_FLOATING_TEXT));
    key = (key << 20n) | BigInt(internSpriteKeyPart(cacheKey));
    const slot = overlaySpriteCacheSlab.getOrBake(key, () => {
        const measureCtx = acquireOffscreenCanvas(1, 1).getContext("2d");
        measureCtx.font = style.font;
        const metrics = measureCtx.measureText(text);
        releaseOffscreenCanvas(measureCtx.canvas);
        const strokeWidth = style.strokeWidth;
        const textWidth = Math.ceil(metrics.width);
        const fontSizeMatch = style.font.match(/(\d+)px/);
        const fontSize = fontSizeMatch ? parseInt(fontSizeMatch[1], 10) : 12;
        const textHeight = Math.ceil(fontSize * 1.3);
        const padding = strokeWidth * 2 + 4;
        const W = textWidth + padding;
        const H = textHeight + padding;
        const canvas = acquireOffscreenCanvas(W, H);
        const offCtx = canvas.getContext("2d");
        offCtx.textAlign = "center";
        offCtx.textBaseline = "middle";
        offCtx.font = style.font;
        const cx = W / 2;
        const cy = H / 2;
        offCtx.strokeStyle = "rgba(0, 0, 0, 0.95)";
        offCtx.lineWidth = strokeWidth;
        offCtx.lineJoin = "round";
        offCtx.miterLimit = 2;
        offCtx.strokeText(text, cx, cy);
        offCtx.fillStyle = style.getFill(offCtx, color);
        offCtx.fillText(text, cx, cy);
        writeSpriteBakeOuts(1, cx, cy, W, H, 1, W);
        return canvas;
    });
    blitAnchoredSprite(ctx, overlaySpriteCacheSlab, slot, worldX, worldY, 0, alpha, scale);
}
export function drawCachedOverlayGlyph(ctx, worldX, worldY, viewport, renderKey, customKey, worldSpan, draw) {
    const px = viewport.x;
    const py = viewport.y;
    const zoom = viewport.zoom;
    let key = BigInt(internSpriteKeyPart(renderKey));
    key = (key << 20n) | BigInt(internSpriteKeyPart(customKey));
    key = (key << 12n) | BigInt(packQuantizedViewBucket(worldX - px, worldY - py));
    key = (key << 16n) | BigInt(packZoomKeyBucket(zoom) & 0xffff);
    const slot = overlaySpriteCacheSlab.getOrBake(key, () => {
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
        writeSpriteBakeOuts(bakeScale, anchorX, anchorY, stageSpan / bakeScale, stageSpan / bakeScale, 1, stageSpan);
        return canvas;
    });
    blitAnchoredSprite(ctx, overlaySpriteCacheSlab, slot, worldX, worldY);
}
export function drawCachedPropSprite(ctx, prop, viewport, renderKey, draw, animFrame = 0, flatPresentation = false) {
    const slot = getOrBakePropSprite(prop, viewport, renderKey, draw, animFrame, flatPresentation);
    blitAnchoredSprite(ctx, propSpriteCacheSlab, slot, prop.x, prop.y);
}
