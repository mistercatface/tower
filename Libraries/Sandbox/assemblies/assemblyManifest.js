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
 * @typedef {object} AssemblyPadManifest
 * @property {string} id
 * @property {string} preset — sink | pull | button
 * @property {AssemblyPlacementManifest} at
 * @property {number} [radius] — sink circle radius
 * @property {number} [depth] — sink pit depth
 * @property {number} [width] — pull rect width
 * @property {number} [height] — pull rect height
 * @property {number} [forceX] — pull override
 * @property {number} [forceY] — pull override
 * @property {boolean} [wallMode] — pull: solid walls when powered
 * @property {boolean} [powered] — pull / sink: starts off when false
 * @property {string} [target] — button: single assembly pickup or pad id
 * @property {string[]} [targets] — button: assembly pickup or pad ids to wire
 * @property {"tap" | "hold" | "toggle" | "massTap" | "massHold" | "massToggle"} [inputMode]
 * @property {number} [massThreshold]
 * @property {boolean} [invert] — button: active when input is off
 * @property {number} [radiusU] — button: radius as playfield width fraction
 */
/**
 * @typedef {object} AssemblyPickupManifest
 * @property {string} [id]
 * @property {string} prop
 * @property {number} [facing]
 * @property {AssemblyPlacementManifest} at
 */
/**
 * @typedef {object} AssemblyManifest
 * @property {string} id
 * @property {string} [label]
 * @property {string} [surfaceProfileId]
 * @property {boolean} [surfaceAnimation]
 * @property {AssemblyArenaManifest} [arena]
 * @property {AssemblyPadManifest[]} [pads]
 * @property {AssemblyWallSegmentManifest[]} [wallSegments]
 * @property {AssemblyArcWallSegmentManifest[]} [arcWallSegments]
 * @property {AssemblyPickupManifest[]} [pickups]
 * @property {{ groupField: string }} link
 * @property {Record<string, { cueStrike?: object, inputGates?: Record<string, object[]> }>} [behaviors]
 */
/**
 * @typedef {object} ResolvedAssemblyManifest
 * @property {string} id
 * @property {string} label
 * @property {string} [surfaceProfileId]
 * @property {boolean} [surfaceAnimation]
 * @property {AssemblyArenaManifest} arena
 * @property {AssemblyPadManifest[]} pads
 * @property {AssemblyWallSegmentManifest[]} wallSegments
 * @property {AssemblyArcWallSegmentManifest[]} arcWallSegments
 * @property {AssemblyPickupManifest[]} pickups
 * @property {string} groupField
 * @property {Record<string, { cueStrike?: object, inputGates?: Record<string, object[]> }>} behaviors
 */
export {};
