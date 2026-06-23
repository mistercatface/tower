/**
 * Shared context for projected wall-face draw (atlas sample, solid fill).
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
 * @property {object | null} cacheObj
 * @property {import("../../Math/Aabb2D.js").Aabb2D} worldBounds
 * @property {import("../../Spatial/iso/ElevationCamera.js").ElevationCamera} camera
 * @property {object} gameState — live game state for horizontal cap chunk sampling
 * @property {string} [atlasFaceId] — per-face wall atlas slot on cacheObj (`inner`, `outer`, `end0`, `end1`)
 * @property {boolean} [skipWallCaps] — wall faces only (no horizontal caps / roofs)
 * @property {number} [damageTintRatio] — 0–1 damage blend for multiply tint overlay (white → red)
 */
