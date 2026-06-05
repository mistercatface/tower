export function createGameMapViewConfig() {
    return {
        mode: "game",
        showWalls: true,
        showGraph: true,
        showPathDebug: false,
    };
}

export function createLabMapViewConfig(options, { viewport, selectedNodeId }) {
    return {
        mode: "lab",
        showWalls: options.showWalls,
        showGraph: options.showNodes,
        showPathDebug: options.showPathDebug,
        graphContext: {
            zoom: viewport.zoom,
            selectedNodeId,
        },
    };
}
