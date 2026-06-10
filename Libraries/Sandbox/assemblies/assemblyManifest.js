/**
 * @typedef {object} AssemblyLayoutManifest
 * @property {number} referenceBallRadius
 * @property {number} ballRadius
 * @property {number} cols
 * @property {number} rows
 * @property {number} railCells
 * @property {number} wallPocketSegmentSize
 * @property {number} pocketCornerRadiusFactor
 * @property {number} pocketSideRadiusFactor
 * @property {number} pocketDepthFactor
 */
/**
 * @typedef {object} AssemblyManifest
 * @property {string} id
 * @property {number} [version]
 * @property {{ cueBall: string, objectBall: string }} props
 * @property {{ groupField: string }} link
 * @property {AssemblyLayoutManifest} layout
 * @property {Record<string, { cueStrike?: object, inputGates?: Record<string, object[]> }>} [behaviors]
 * @property {string[]} [spawn]
 */
/**
 * @typedef {object} ResolvedAssemblyLayout
 * @property {number} referenceBallRadius
 * @property {number} ballRadius
 * @property {number} scale
 * @property {number} cols
 * @property {number} rows
 * @property {number} railCells
 * @property {number} cellSize
 * @property {number} wallPocketSegmentSize
 * @property {{ corner: number, side: number, depth: number }} pocketRadii
 */
/**
 * @typedef {object} ResolvedAssemblyManifest
 * @property {string} id
 * @property {{ cueBall: string, objectBall: string }} props
 * @property {string} groupField
 * @property {ResolvedAssemblyLayout} layout
 * @property {Record<string, { cueStrike?: object, inputGates?: Record<string, object[]> }>} behaviors
 * @property {string[]} spawn
 */
export {};
