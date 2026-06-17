import { createOffscreenCanvas } from "./offscreenCanvas.js";
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
