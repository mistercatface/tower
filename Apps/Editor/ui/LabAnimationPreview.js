import { paintPixelArea } from "../../../Libraries/WorldSurface/WorldSurfacePainter.js";
import { resolveBakeProfile, getAnimationDuration } from "../../../Libraries/WorldSurface/ProfileBakeResolver.js";
import { minCornerAabb } from "../../../Libraries/Math/Aabb2D.js";
import { getGameWorldSurfaceSettings } from "../../../Render/WorldSurfaceBootstrap.js";
import { getAssemblyRailBandBounds } from "../../../Libraries/Sandbox/assemblyLayout.js";
/** Square assembly with a wide rail band so wall motifs are easy to read. */
const PREVIEW_ASSEMBLY = { size: 96, wallWidth: 16, railHeight: 4 };
const previewLayout = {
    bounds: minCornerAabb(0, 0, PREVIEW_ASSEMBLY.size, PREVIEW_ASSEMBLY.size),
    play: minCornerAabb(PREVIEW_ASSEMBLY.wallWidth, PREVIEW_ASSEMBLY.wallWidth, PREVIEW_ASSEMBLY.size - PREVIEW_ASSEMBLY.wallWidth * 2, PREVIEW_ASSEMBLY.size - PREVIEW_ASSEMBLY.wallWidth * 2),
};
let rafId = null;
let lastGameTime = 0;
let lastDrawTime = 0;
let isAnimationEnabled = false;
/** @type {HTMLCanvasElement | null} */
let patchCanvas = null;
/** Vertical space taken by the animation preview (for map canvas max-size). */
export function estimateAnimationPreviewHeight(fallbackSize = 200) {
    const stage = document.getElementById("animationStage");
    if (!stage || stage.hidden) return 0;
    const host = document.getElementById("animationPreviewHost");
    const headerH = stage.querySelector(".animation-stage-header")?.offsetHeight ?? 18;
    const hostH = host?.offsetHeight ?? fallbackSize;
    return hostH + headerH + 6;
}
export function initAnimationPreview(canvas, getProfileConfig) {
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    let currentProfileStr = null;
    function tick(timestamp) {
        rafId = requestAnimationFrame(tick);
        const profile = getProfileConfig();
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
                drawFrame(ctx, canvas, profile, 0);
                lastDrawTime = timestamp;
            }
            return;
        }
        const delta = timestamp - lastDrawTime;
        if (forceDraw || delta > 32 || lastDrawTime === 0) {
            const duration = getAnimationDuration(profile.animation);
            if (!forceDraw || delta <= 32) lastGameTime = (lastGameTime + delta) % duration;
            drawFrame(ctx, canvas, profile, lastGameTime);
            lastDrawTime = timestamp;
        }
    }
    if (rafId !== null) cancelAnimationFrame(rafId);
    lastDrawTime = performance.now();
    lastGameTime = 0;
    rafId = requestAnimationFrame(tick);
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
    const pixelsPerUnit = canvas.width / PREVIEW_ASSEMBLY.size;
    ctx.fillStyle = "#080a0e";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const railBands = getAssemblyRailBandBounds({ bounds, play });
    paintPreviewPatch(ctx, bounds, play, pixelsPerUnit, cellSize, resolvedProfile, 0);
    for (let i = 0; i < railBands.length; i++) paintPreviewPatch(ctx, bounds, railBands[i], pixelsPerUnit, cellSize, resolvedProfile, PREVIEW_ASSEMBLY.railHeight);
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
    if (!patchCanvas) patchCanvas = document.createElement("canvas");
    if (patchCanvas.width !== destW || patchCanvas.height !== destH) {
        patchCanvas.width = destW;
        patchCanvas.height = destH;
    }
    const patchCtx = patchCanvas.getContext("2d");
    patchCtx.imageSmoothingEnabled = false;
    const paintOptions = zLevel > 0 ? { cellSize, pixelsPerUnit, isWall: true, roofSurface: true } : { cellSize, pixelsPerUnit };
    paintPixelArea(patchCtx, destW, destH, worldRect.minX, worldRect.minY, 42, paintOptions, profile);
    ctx.drawImage(patchCanvas, destX, destY);
}
