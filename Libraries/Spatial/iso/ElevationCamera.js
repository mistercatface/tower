import { resolveStructurePerspectiveStrength } from "../../../Core/GamePerspective.js";
/**
 * @typedef {Object} ElevationCamera
 * @property {number} viewerX
 * @property {number} viewerY
 * @property {number} cameraHeight
 * @property {number} strength
 */
/** @param {import("../../Viewport/Viewport.js").Viewport} viewport @param {number} cameraHeight @returns {ElevationCamera} */
export function elevationCameraFromViewport(viewport, cameraHeight) {
    return { viewerX: viewport.x, viewerY: viewport.y, cameraHeight, strength: resolveStructurePerspectiveStrength(viewport) };
}
/** @param {import("../../WorldSurface/ChunkDrawPass.js").ChunkDrawPass} pass @returns {ElevationCamera} */
export function elevationCameraFromChunkPass(pass) {
    return { viewerX: pass.viewerX, viewerY: pass.viewerY, cameraHeight: pass.cameraHeight, strength: resolveStructurePerspectiveStrength(pass.viewport) };
}
