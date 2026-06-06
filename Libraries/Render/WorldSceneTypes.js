/**
 * Shared draw-input types for Structure3D + Props3D.
 * WorldSurface is optional — omit both fields for solid-color structure placeholders.
 */
/**
 * @typedef {Object} SurfaceBakeContext
 * @property {number} surfaceSeed
 * @property {number} gameTime
 * @property {string|null} surfaceProfileOverride
 * @property {(x: number, y: number) => string} resolveProfileAt
 * @property {number} obstacleCellSize
 */
/**
 * @typedef {Object} WorldSceneDrawInput
 * @property {{ x: number, y: number }} viewer
 * @property {object[]} walls
 * @property {object|null} wallSpatialIndex
 * @property {object[]} pickups
 * @property {{ width: number, height: number }|null} canvasBounds
 * @property {import("../WorldSurface/WorldSurfaceEngine.js").WorldSurfaceEngine|null} [worldSurfaces]
 * @property {SurfaceBakeContext|null} [surfaceBake]
 */
/**
 * @typedef {Object} WorldSceneDrawOptions
 * @property {boolean} [fastNav]
 * @property {boolean} [textureEnabled]
 */
export {};
