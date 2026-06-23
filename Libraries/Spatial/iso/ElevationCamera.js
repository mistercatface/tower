import { activePerspective, resolveStructurePerspectiveStrength } from "../../../Core/GamePerspective.js";
/**
 * @typedef {Object} ElevationCamera
 * @property {number} viewerX
 * @property {number} viewerY
 * @property {number} cameraHeight
 * @property {number} strength
 */
/** @param {import("../../Viewport/Viewport.js").Viewport} viewport @returns {ElevationCamera} */
export function elevationCameraFromViewport(viewport) {
    const { cameraHeight } = activePerspective;
    return { viewerX: viewport.x, viewerY: viewport.y, cameraHeight, strength: resolveStructurePerspectiveStrength(viewport) };
}
/** @param {ElevationCamera} out @param {import("../../Viewport/Viewport.js").Viewport} viewport @returns {ElevationCamera} */
export function elevationCameraFromViewportInto(out, viewport) {
    const { cameraHeight } = activePerspective;
    out.viewerX = viewport.x;
    out.viewerY = viewport.y;
    out.cameraHeight = cameraHeight;
    out.strength = resolveStructurePerspectiveStrength(viewport);
    return out;
}
/** Session perspective at a viewer position — base strength, not zoom-scaled. */
export function elevationCameraFromViewer(viewerX, viewerY) {
    const { cameraHeight, strength } = activePerspective;
    return { viewerX, viewerY, cameraHeight, strength };
}
