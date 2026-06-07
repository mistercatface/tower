export function createTopologyMapViewConfig(options, { viewport, selectedNodeId }) {
    return {
        showWalls: options.showWalls,
        showGraph: options.showNodes,
        showPathDebug: options.showPathDebug,
        graphContext: { zoom: viewport.zoom, selectedNodeId },
    };
}
