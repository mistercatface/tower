/**
 * @typedef {Object} ElevationCamera
 * @property {number} viewerX
 * @property {number} viewerY
 * @property {number} cameraHeight
 * @property {number} strength
 */
/** @param {import("../../Viewport/Viewport.js").Viewport} viewport @returns {ElevationCamera} */
export function elevationCameraFromViewport(viewport) {
    return { viewerX: viewport.x, viewerY: viewport.y, cameraHeight: viewport.cameraHeight, strength: viewport.perspectiveStrength };
}
/** @param {ElevationCamera} out @param {import("../../Viewport/Viewport.js").Viewport} viewport @returns {ElevationCamera} */
export function elevationCameraFromViewportInto(out, viewport) {
    out.viewerX = viewport.x;
    out.viewerY = viewport.y;
    out.cameraHeight = viewport.cameraHeight;
    out.strength = viewport.perspectiveStrength;
    return out;
}
