import { drawSphereTexturePatch } from "../SurfaceTexturing/drawSphereTexturePatch.js";
/**
 * Map an image onto a latitudinal band of a rolled sphere (full wrap).
 * Prefer {@link drawSphereTexturePatch} for localized decals such as ball numbers.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} prop
 * @param {number} px
 * @param {number} py
 * @param {CanvasImageSource} img
 * @param {{
 *   baseRadius?: number,
 *   latBands?: number,
 *   lonBands?: number,
 *   vMin?: number,
 *   vMax?: number,
 *   uvBleed?: number,
 * }} [options]
 */
export function drawSphereTextureBand(ctx, prop, viewport, img, options = {}) {
    const vMin = options.vMin ?? 0.35;
    const vMax = options.vMax ?? 0.65;
    const phiMid = Math.PI * (vMin + vMax) * 0.5;
    const phiHalf = Math.PI * (vMax - vMin) * 0.5;
    drawSphereTexturePatch(ctx, prop, viewport, img, {
        baseRadius: options.baseRadius,
        phiCenter: phiMid,
        phiHalf,
        thetaCenter: Math.PI,
        thetaHalf: Math.PI,
        phiSegments: options.latBands ?? 8,
        thetaSegments: options.lonBands ?? 16,
        uvBleed: options.uvBleed,
    });
}
