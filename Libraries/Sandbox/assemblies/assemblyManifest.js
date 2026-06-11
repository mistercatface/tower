/**
 * @typedef {object} AssemblyArenaWallOpeningsManifest
 * @property {{ centerU: number, widthU: number }} [bottom]
 */
/**
 * @typedef {object} AssemblyArenaWallsManifest
 * @property {number} width — rail thickness in world units
 * @property {number} height — wall prism height in world units
 * @property {number} segmentSize — length of each wall segment along an edge
 * @property {{ padding?: number, maxHealth?: number, health?: number }} segment
 * @property {AssemblyArenaWallOpeningsManifest} [openings]
 */
/**
 * @typedef {object} AssemblyWallSegmentManifest
 * @property {string} [id]
 * @property {AssemblyPlacementManifest} from
 * @property {AssemblyPlacementManifest} to
 */
/**
 * @typedef {object} AssemblyArcWallSegmentManifest
 * @property {string} [id]
 * @property {AssemblyPlacementManifest} center
 * @property {number} radiusU
 * @property {number} startAngle
 * @property {number} endAngle
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
 * @typedef {object} AssemblySinkPadManifest
 * @property {string} id
 * @property {number} radius
 * @property {number} depth
 * @property {AssemblyPlacementManifest} placement
 */
/**
 * @typedef {object} AssemblyPullPadManifest
 * @property {string} id
 * @property {number} width
 * @property {number} height
 * @property {number} [forceX]
 * @property {number} [forceY]
 * @property {AssemblyPlacementManifest} placement
 */
/**
 * @typedef {object} AssemblyPropButtonManifest
 * @property {AssemblyPlacementManifest} [at] — playfield anchor or u/v
 * @property {number} [u] — playfield horizontal fraction (shorthand for at.u)
 * @property {number} [v] — playfield vertical fraction (shorthand for at.v)
 * @property {string} effect — registered pad effect id (e.g. flipper)
 * @property {number} [radiusU] — button radius as fraction of playfield width
 */
/**
 * @typedef {object} AssemblyPickupManifest
 * @property {string} [id]
 * @property {string} prop
 * @property {number} [facing]
 * @property {AssemblyPlacementManifest} at
 * @property {AssemblyPropButtonManifest} [button]
 */
/**
 * @typedef {object} AssemblyManifest
 * @property {string} id
 * @property {string} [label]
 * @property {string} [surfaceProfileId]
 * @property {boolean} [surfaceAnimation]
 * @property {number} [version]
 * @property {AssemblyArenaManifest} [arena]
 * @property {string[]} [props] — prop catalog ids this assembly uses
 * @property {AssemblySinkPadManifest[]} [sinkPads]
 * @property {AssemblyPullPadManifest[]} [pullPads]
 * @property {AssemblyWallSegmentManifest[]} [wallSegments]
 * @property {AssemblyArcWallSegmentManifest[]} [arcWallSegments]
 * @property {AssemblyPickupManifest[]} [pickups]
 * @property {{ groupField: string }} link
 * @property {Record<string, { cueStrike?: object, inputGates?: Record<string, object[]> }>} [behaviors]
 * @property {string[]} [spawn]
 */
/**
 * @typedef {object} ResolvedAssemblyManifest
 * @property {string} id
 * @property {string} label
 * @property {string} [surfaceProfileId]
 * @property {boolean} [surfaceAnimation]
 * @property {number} version
 * @property {AssemblyArenaManifest} arena
 * @property {string[]} props
 * @property {AssemblySinkPadManifest[]} sinkPads
 * @property {AssemblyPullPadManifest[]} [pullPads]
 * @property {AssemblyWallSegmentManifest[]} wallSegments
 * @property {AssemblyArcWallSegmentManifest[]} arcWallSegments
 * @property {AssemblyPickupManifest[]} pickups
 * @property {string} groupField
 * @property {Record<string, { cueStrike?: object, inputGates?: Record<string, object[]> }>} behaviors
 * @property {string[]} spawn
 */
export {};
