/**
 * @typedef {object} AssemblyPropManifest
 * @property {object} physics
 * @property {object} visuals
 */
/**
 * @typedef {object} AssemblyArenaWallsManifest
 * @property {number} width — rail thickness in world units
 * @property {number} height — wall prism height in world units
 * @property {number} segmentSize — length of each wall segment along an edge
 * @property {{ padding?: number, maxHealth?: number, health?: number }} segment
 */
/**
 * @typedef {object} AssemblyArenaManifest
 * @property {number} width
 * @property {number} height
 * @property {number} clearPadding
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
 * @property {number} radius
 * @property {number} depth
 * @property {AssemblyPlacementManifest} placement
 */
/**
 * @typedef {object} AssemblyPickupManifest
 * @property {string} [id]
 * @property {string} prop
 * @property {AssemblyPlacementManifest} at
 */
/**
 * @typedef {object} AssemblyManifest
 * @property {string} id
 * @property {number} [version]
 * @property {AssemblyArenaManifest} [arena]
 * @property {Record<string, AssemblyPropManifest>} [props]
 * @property {AssemblyVoidCircleManifest[]} [voidCircles]
 * @property {AssemblyPickupManifest[]} [pickups]
 * @property {{ groupField: string }} link
 * @property {Record<string, { cueStrike?: object, inputGates?: Record<string, object[]> }>} [behaviors]
 * @property {string[]} [spawn]
 */
/**
 * @typedef {object} ResolvedAssemblyManifest
 * @property {string} id
 * @property {number} version
 * @property {AssemblyArenaManifest} arena
 * @property {Record<string, AssemblyPropManifest>} props
 * @property {AssemblyVoidCircleManifest[]} voidCircles
 * @property {AssemblyPickupManifest[]} pickups
 * @property {string} groupField
 * @property {Record<string, { cueStrike?: object, inputGates?: Record<string, object[]> }>} behaviors
 * @property {string[]} spawn
 */
export {};
