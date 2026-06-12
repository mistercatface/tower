/**
 * Shared draw-input types for Structure3D + Props3D.
 * WorldSurface is optional — omit both fields for solid-color structure placeholders.
 */
/**
 * Per-frame procedural ground/wall texture lookup — profile and seed.
 *
 * @typedef {Object} ProceduralSurfaceDrawContext
 * @property {number} surfaceSeed
 * @property {string|null} surfaceProfileOverride
 * @property {(x: number, y: number) => string} resolveProfileAt
 * @property {number} obstacleCellSize
 */
/**
 * @typedef {Object} WorldSceneDrawInput
 * @property {import("../../GameState/EntityRegistry.js").EntityRegistry} entityRegistry
 * @property {import("../Spatial/world/SpatialFrameCore.js").SpatialFrameCore} spatialFrame
 * @property {object[]} [ragdollCorpses]
 * @property {import("../WorldSurface/WorldSurfaceEngine.js").WorldSurfaceEngine|null} [worldSurfaces]
 * @property {ProceduralSurfaceDrawContext|null} [proceduralSurfaceDraw]
 * @property {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid|null} [obstacleGrid]
 * @property {object|null} [gameState]
 */
/**
 * @typedef {Object} WorldSceneDrawOptions
 * @property {boolean} [textureEnabled]
 */
export {};
