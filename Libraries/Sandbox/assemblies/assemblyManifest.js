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
 * @property {string} preset — pull | button
 * @property {AssemblyPlacementManifest} at
 * @property {number} [width] — pull rect width
 * @property {number} [height] — pull rect height
 * @property {number} [forceX] — pull override
 * @property {number} [forceY] — pull override
 * @property {boolean} [wallMode] — pull: solid walls when powered
 * @property {boolean} [powered] — pull: starts off when false
 * @property {string} [target] — button: single assembly prop or pad id
 * @property {string[]} [targets] — button: assembly prop or pad ids to wire
 * @property {"tap" | "hold" | "toggle" | "massTap" | "massHold" | "massToggle"} [inputMode]
 * @property {number} [massThreshold]
 * @property {boolean} [invert] — button: active when input is off
 * @property {number} [radiusU] — button: radius as playfield width fraction
 */
/**
 * @typedef {object} AssemblyWorldPropManifest
 * @property {string} [id]
 * @property {string} prop
 * @property {number} [facing]
 * @property {number} [radius] — floor fixtures e.g. void pit mouth radius
 * @property {number} [depth] — void pit pocket depth
 * @property {number} [captureTolerance]
 * @property {number} [width] — gravity pad rect width
 * @property {number} [height] — gravity pad rect height
 * @property {number} [forceX] — gravity pad pull override
 * @property {number} [forceY] — gravity pad pull override
 * @property {boolean} [wallMode] — gravity pad wall mode when powered
 * @property {boolean} [powered] — starts unpowered when false
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
 * @property {AssemblyWorldPropManifest[]} [worldProps]
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
 * @property {AssemblyWorldPropManifest[]} worldProps
 * @property {string} groupField
 * @property {Record<string, { cueStrike?: object, inputGates?: Record<string, object[]> }>} behaviors
 */
export {};
