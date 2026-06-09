/**
 * Shared draw-input types for Structure3D + Props3D.
 * WorldSurface is optional — omit both fields for solid-color structure placeholders.
 */
/**
 * Per-frame procedural ground/wall texture lookup — profile, seed, and animation time.
 *
 * @typedef {Object} ProceduralSurfaceDrawContext
 * @property {number} surfaceSeed
 * @property {number} gameTime
 * @property {string|null} surfaceProfileOverride
 * @property {(x: number, y: number) => string} resolveProfileAt
 * @property {number} obstacleCellSize
 */
/**
 * @typedef {Object} WorldSceneDrawInput
 * @property {object[]} pickups
 * @property {object[]} [ragdollCorpses]
 * @property {import("../WorldSurface/WorldSurfaceEngine.js").WorldSurfaceEngine|null} [worldSurfaces]
 * @property {ProceduralSurfaceDrawContext|null} [proceduralSurfaceDraw]
 */
/**
 * @typedef {Object} WorldSceneDrawOptions
 * @property {boolean} [textureEnabled]
 */
export {};
