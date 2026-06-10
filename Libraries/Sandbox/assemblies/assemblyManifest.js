/**
 * @typedef {object} AssemblyScaleManifest
 * @property {number} referenceBallRadius
 * @property {number} ballRadius
 */
/**
 * @typedef {object} AssemblyArenaGridManifest
 * @property {number} cols
 * @property {number} rows
 * @property {number} railCells
 */
/**
 * @typedef {object} AssemblyArenaWallsManifest
 * @property {string} recipe
 * @property {number} railHeightCells
 * @property {{ padding?: number, maxHealth?: number, health?: number }} segment
 * @property {{ extraRadiusFactor?: number }} voidCarve
 * @property {{ segmentSizeAtReference: number }} voidBackArc
 */
/**
 * @typedef {object} AssemblyArenaManifest
 * @property {AssemblyArenaGridManifest} grid
 * @property {number} clearPaddingCells
 * @property {AssemblyArenaWallsManifest} walls
 */
/**
 * @typedef {object} AssemblyPlacementManifest
 * @property {string} [anchor]
 * @property {{ x?: number, y?: number }} [offset]
 * @property {string} [space]
 * @property {number} [u]
 * @property {number} [v]
 */
/**
 * @typedef {object} AssemblyVoidCircleManifest
 * @property {string} id
 * @property {string} radiusRef
 * @property {string} depthRef
 * @property {AssemblyPlacementManifest} placement
 * @property {{ openingArc: { start: number, end: number } }} [wallCarve]
 */
/**
 * @typedef {object} AssemblyPickupManifest
 * @property {string} [id]
 * @property {string} prop
 * @property {AssemblyPlacementManifest} at
 * @property {number} [poolBall]
 */
/**
 * @typedef {object} AssemblyManifest
 * @property {string} id
 * @property {number} [version]
 * @property {AssemblyScaleManifest} [scale]
 * @property {AssemblyArenaManifest} [arena]
 * @property {{ voidRadii: Record<string, { factor: number, of?: string } | number> }} [refs]
 * @property {AssemblyVoidCircleManifest[]} [voidCircles]
 * @property {AssemblyPickupManifest[]} [pickups]
 * @property {{ groupField: string }} link
 * @property {Record<string, { cueStrike?: object, inputGates?: Record<string, object[]> }>} [behaviors]
 * @property {string[]} [spawn]
 */
/**
 * @typedef {object} ResolvedAssemblyArena
 * @property {AssemblyArenaGridManifest} grid
 * @property {number} cellSize
 * @property {number} clearPaddingCells
 * @property {AssemblyArenaWallsManifest & { railHeight: number, voidBackArcSegmentSize: number, voidCarveExtraRadius: number }} walls
 */
/**
 * @typedef {object} ResolvedAssemblyManifest
 * @property {string} id
 * @property {number} version
 * @property {{ referenceBallRadius: number, ballRadius: number, factor: number }} scale
 * @property {ResolvedAssemblyArena} arena
 * @property {{ voidRadii: Record<string, number> }} refs
 * @property {AssemblyVoidCircleManifest[]} voidCircles
 * @property {AssemblyPickupManifest[]} pickups
 * @property {string} groupField
 * @property {Record<string, { cueStrike?: object, inputGates?: Record<string, object[]> }>} behaviors
 * @property {string[]} spawn
 */
export {};
