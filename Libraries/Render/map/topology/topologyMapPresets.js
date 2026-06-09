/**
 * @typedef {Object} TopologyDisplayOptions
 * @property {boolean} showNodes
 * @property {boolean} showWalls
 * @property {boolean} showPathDebug
 * @property {boolean} [showRoomZones]
 * @property {boolean} [showGridBounds]
 */
/**
 * @param {TopologyDisplayOptions} options
 * @param {{ viewport: import("../../../Viewport/Viewport.js").Viewport, selectedNodeId?: number | null }} context
 */
export function createTopologyMapViewConfig(options, { viewport, selectedNodeId }) {
    return { showWalls: options.showWalls, showGraph: options.showNodes, showPathDebug: options.showPathDebug, graphContext: { zoom: viewport.zoom, selectedNodeId } };
}
