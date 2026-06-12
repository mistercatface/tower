/**
 * Shared context for projected wall-face draw (atlas sample, solid fill, damage overlay).
 */
/** @typedef {import("../WorldSceneTypes.js").ProceduralSurfaceDrawContext} ProceduralSurfaceDrawContext */
/**
 * @typedef {Object} WallDrawContext
 * @property {number} wallHeight
 * @property {number} viewerX
 * @property {number} viewerY
 * @property {import("../../Viewport/Viewport.js").Viewport | null} [viewport]
 * @property {{ settings?: import("../../WorldSurface/WorldSurfaceSettings.js").WorldSurfaceSettings } | null} [worldSurfaces]
 * @property {ProceduralSurfaceDrawContext | null} [proceduralSurfaceDraw]
 * @property {string} fillStyle
 * @property {number} [damageAlpha]
 * @property {object | null} [cacheObj]
 * @property {import("../../Math/Aabb2D.js").Aabb2D | null} [worldBounds]
 */
/** @param {WallDrawContext} spec @returns {WallDrawContext} */
export function createWallDrawContext(spec) {
    return { damageAlpha: 0, cacheObj: null, worldBounds: null, viewport: null, worldSurfaces: null, proceduralSurfaceDraw: null, ...spec };
}
/**
 * Scene-level fields shared across wall faces in one draw pass.
 *
 * @param {import("../WorldSceneTypes.js").WorldSceneDrawInput} input
 * @param {import("../../Viewport/Viewport.js").Viewport} viewport
 * @param {number} viewerX
 * @param {number} viewerY
 * @param {import("../../Math/Aabb2D.js").Aabb2D} worldBounds
 * @param {string} fillStyle
 */
export function createWallDrawContextFromScene(input, viewport, viewerX, viewerY, worldBounds, fillStyle) {
    return createWallDrawContext({ viewerX, viewerY, viewport, worldSurfaces: input.worldSurfaces, proceduralSurfaceDraw: input.proceduralSurfaceDraw, fillStyle, wallHeight: 0, worldBounds });
}
