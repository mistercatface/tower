export function createGameMapViewConfig() {
    return {
        mode: "game",
        showWalls: true,
        showGraph: true,
        showPathDebug: false,
    };
}

export function createLabMapViewConfig(options, { camera, selectedNodeId }) {
    return {
        mode: "lab",
        showWalls: options.showWalls,
        showGraph: options.showNodes,
        showPathDebug: options.showPathDebug,
        graphContext: {
            zoom: camera.zoom,
            selectedNodeId,
        },
    };
}
