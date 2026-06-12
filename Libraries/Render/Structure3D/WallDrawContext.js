/**
 * Shared context for projected wall-face draw (atlas sample, solid fill, damage overlay).
 */
/** @typedef {import("../WorldSceneTypes.js").ProceduralSurfaceDrawContext} ProceduralSurfaceDrawContext */
/**
 * @typedef {Object} WallDrawContext
 * @property {number} wallHeight — visible band height (top − base)
 * @property {number} wallBaseZ — world z of band bottom
 * @property {number} wallCapHeight — full wall bake height for atlas lookup
 * @property {import("../../Viewport/Viewport.js").Viewport} viewport
 * @property {{ settings: import("../../WorldSurface/WorldSurfaceSettings.js").WorldSurfaceSettings }} worldSurfaces
 * @property {ProceduralSurfaceDrawContext} proceduralSurfaceDraw
 * @property {string} fillStyle
 * @property {number} damageAlpha
 * @property {object | null} cacheObj
 * @property {import("../../Math/Aabb2D.js").Aabb2D} worldBounds
 * @property {import("../../Spatial/iso/ElevationCamera.js").ElevationCamera} camera
 */
