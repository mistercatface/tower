import { renderMapView } from "../../../Libraries/Render/map/MapViewRenderer.js";
import { createTopologyMapViewConfig } from "../render/topologyMapPresets.js";
import { TOPOLOGY_MAP_GRAPH_STYLES } from "../render/topologyMapStyles.js";
import { drawTopologyOverlays } from "../render/topologyOverlays.js";
import { prepareGameCanvas } from "./surfacePreview.js";
/** @param {import("../TileLabGameState.js").TileLabGameState} state */
export function renderMapTopologyView(state, viewport, options, selectedNodeId, playerPos, targetPos, currentPath, abstractPath) {
    const stage = document.getElementById("mapStage");
    const canvas = document.getElementById("mapPreview");
    const size = prepareGameCanvas(canvas, stage);
    if (!size || !canvas) return;
    viewport.setCanvasSize(size.width, size.height);
    renderMapView(canvas.getContext("2d"), state, {
        ...createTopologyMapViewConfig(options, { viewport, selectedNodeId }),
        width: size.width,
        height: size.height,
        viewport,
        wallCache: state.mapTopologyWallCache,
        graphStyles: TOPOLOGY_MAP_GRAPH_STYLES,
        topologyOptions: options,
        playerPos,
        targetPos,
        currentPath,
        abstractPath,
        drawOverlays: drawTopologyOverlays,
    });
    const statusLine = document.getElementById("mapStatusLine");
    if (statusLine)
        statusLine.textContent = `Cam: ${Math.round(viewport.x)}, ${Math.round(viewport.y)} · Zoom: ${viewport.zoom.toFixed(2)}x · ` + `Nodes: ${state.mapNodes.length} · Walls: ${state.walls.length}`;
}
