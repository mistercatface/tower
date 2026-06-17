import { createOffscreenCanvas, resizeOffscreenCanvas } from "../../../Libraries/Canvas/offscreenCanvas.js";
import { applySquareCanvasResize } from "../../../Libraries/Canvas/index.js";
import { paintPixelArea } from "../../../Libraries/WorldSurface/WorldSurfacePainter.js";
import { resolveBakeProfile, getAnimationDuration } from "../../../Libraries/WorldSurface/ProfileBakeResolver.js";
import { minCornerAabb } from "../../../Libraries/Math/Aabb2D.js";
import { getGameWorldSurfaceSettings } from "../../../Render/WorldSurfaceBootstrap.js";
import { EDITOR_CANVAS_DEFAULTS } from "../state.js";
/** @type {import("../../../Libraries/Canvas/squareCanvasResize.js").SquareCanvasResizeHandle | null} */
let animationCanvasResize = null;
/** Square preview with a wide rail band so wall motifs are easy to read. */
const PREVIEW_RAIL_BAND = { size: 96, wallWidth: 16, railHeight: 4 };
const previewLayout = {
    bounds: minCornerAabb(0, 0, PREVIEW_RAIL_BAND.size, PREVIEW_RAIL_BAND.size),
    play: minCornerAabb(PREVIEW_RAIL_BAND.wallWidth, PREVIEW_RAIL_BAND.wallWidth, PREVIEW_RAIL_BAND.size - PREVIEW_RAIL_BAND.wallWidth * 2, PREVIEW_RAIL_BAND.size - PREVIEW_RAIL_BAND.wallWidth * 2),
};
/** @param {{ bounds: import("../../../Libraries/Math/Aabb2D.js").Aabb2D, play: import("../../../Libraries/Math/Aabb2D.js").Aabb2D }} layout */
function getPreviewRailBandBounds(layout) {
    const { bounds, play } = layout;
    /** @type {import("../../../Libraries/Math/Aabb2D.js").Aabb2D[]} */
    const bands = [];
    if (play.minY > bounds.minY) bands.push(minCornerAabb(bounds.minX, bounds.minY, bounds.maxX - bounds.minX, play.minY - bounds.minY));
    if (play.maxY < bounds.maxY) bands.push(minCornerAabb(bounds.minX, play.maxY, bounds.maxX - bounds.minX, bounds.maxY - play.maxY));
    if (play.minX > bounds.minX) bands.push(minCornerAabb(bounds.minX, play.minY, play.minX - bounds.minX, play.maxY - play.minY));
    if (play.maxX < bounds.maxX) bands.push(minCornerAabb(play.maxX, play.minY, bounds.maxX - play.maxX, play.maxY - play.minY));
    return bands;
}
let lastGameTime = 0;
let lastDrawTime = 0;
let isAnimationEnabled = false;
let previewActive = false;
let patchCanvas = null;
let patchCtx = null;
let previewCtx = null;
let previewCanvas = null;
/** @type {(() => object | null) | null} */
let readProfileConfig = null;
let currentProfileStr = null;
function ensurePatchSurface(destW, destH) {
    if (!patchCanvas) {
        patchCanvas = createOffscreenCanvas(destW, destH);
        patchCtx = patchCanvas.getContext("2d");
        return;
    }
    const prevW = patchCanvas.width;
    const prevH = patchCanvas.height;
    resizeOffscreenCanvas(patchCanvas, destW, destH);
    if (patchCanvas.width !== prevW || patchCanvas.height !== prevH) patchCtx = patchCanvas.getContext("2d");
}
/** @param {HTMLCanvasElement} canvas @param {{ host: HTMLElement, maxSize: () => number }} options */
export function mountAnimationPreviewCanvas(canvas, { host, maxSize }) {
    const { initialSize, minSize } = EDITOR_CANVAS_DEFAULTS.animationPreview;
    animationCanvasResize = applySquareCanvasResize(canvas, { host, initialSize, minSize, maxSize });
}
/** @param {number} stackSize */
export function syncAnimationPreviewCanvasSize(state, stackSize) {
    if (state.editor.showAnimationPreview) animationCanvasResize.setSize(stackSize);
}
/** @param {boolean} active */
export function setAnimationPreviewActive(active) {
    previewActive = active;
    if (active) {
        lastDrawTime = 0;
        lastGameTime = 0;
    }
}
/** @param {number} timestamp */
export function tickAnimationPreview(timestamp) {
    if (!previewActive) return;
    const profile = readProfileConfig?.();
    if (!profile) return;
    let forceDraw = false;
    const profileStr = JSON.stringify(profile);
    if (profileStr !== currentProfileStr) {
        currentProfileStr = profileStr;
        isAnimationEnabled = Boolean(profile.animation);
        forceDraw = true;
    }
    if (!isAnimationEnabled) {
        if (forceDraw || lastDrawTime === 0) {
            drawFrame(previewCtx, previewCanvas, profile, 0);
            lastDrawTime = timestamp;
        }
        return;
    }
    const delta = timestamp - lastDrawTime;
    if (forceDraw || delta > 32 || lastDrawTime === 0) {
        const duration = getAnimationDuration(profile.animation);
        if (!forceDraw || delta <= 32) lastGameTime = (lastGameTime + delta) % duration;
        drawFrame(previewCtx, previewCanvas, profile, lastGameTime);
        lastDrawTime = timestamp;
    }
}
export function initAnimationPreview(canvas, getProfileConfig) {
    previewCtx = canvas.getContext("2d");
    previewCanvas = canvas;
    readProfileConfig = getProfileConfig;
    currentProfileStr = null;
}
/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {HTMLCanvasElement} canvas
 * @param {object} baseProfile
 * @param {number} gameTime
 */
function drawFrame(ctx, canvas, baseProfile, gameTime) {
    const resolvedProfile = resolveBakeProfile(baseProfile, "__labAnimPreview__", { gameTime });
    const { cellSize } = getGameWorldSurfaceSettings();
    const { bounds, play } = previewLayout;
    const pixelsPerUnit = canvas.width / PREVIEW_RAIL_BAND.size;
    ctx.fillStyle = "#080a0e";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const railBands = getPreviewRailBandBounds(previewLayout);
    paintPreviewPatch(ctx, bounds, play, pixelsPerUnit, cellSize, resolvedProfile, 0);
    for (let i = 0; i < railBands.length; i++) paintPreviewPatch(ctx, bounds, railBands[i], pixelsPerUnit, cellSize, resolvedProfile, PREVIEW_RAIL_BAND.railHeight);
}
/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {import("../../../Libraries/Math/Aabb2D.js").Aabb2D} bounds
 * @param {import("../../../Libraries/Math/Aabb2D.js").Aabb2D} worldRect
 * @param {number} pixelsPerUnit
 * @param {number} cellSize
 * @param {object} profile
 * @param {number} zLevel
 */
function paintPreviewPatch(ctx, bounds, worldRect, pixelsPerUnit, cellSize, profile, zLevel) {
    const destX = Math.round((worldRect.minX - bounds.minX) * pixelsPerUnit);
    const destY = Math.round((worldRect.minY - bounds.minY) * pixelsPerUnit);
    const destW = Math.max(1, Math.round((worldRect.maxX - worldRect.minX) * pixelsPerUnit));
    const destH = Math.max(1, Math.round((worldRect.maxY - worldRect.minY) * pixelsPerUnit));
    ensurePatchSurface(destW, destH);
    const paintOptions = zLevel > 0 ? { cellSize, pixelsPerUnit, isWall: true, roofSurface: true } : { cellSize, pixelsPerUnit };
    paintPixelArea(patchCtx, destW, destH, worldRect.minX, worldRect.minY, 42, paintOptions, profile);
    ctx.drawImage(patchCanvas, destX, destY);
}
