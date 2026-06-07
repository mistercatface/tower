import { renderMapView } from "../../../Games/tower/render/map/MapViewRenderer.js";
import { createLabMapViewConfig } from "../../../Games/tower/render/map/mapViewPresets.js";
import { drawMapLabOverlays } from "../../../Games/tower/render/map/MapLabOverlays.js";
import { prepareGameCanvas } from "./surfacePreview.js";
/**
 * @param {import("../TileLabGameState.js").TileLabGameState} state
 * @param {import("../../../Libraries/Viewport/Viewport.js").Viewport} viewport
 */
export function renderMapTopologyView(state, viewport, options, selectedNodeId, playerPos, targetPos, currentPath, abstractPath) {
    const stage = document.getElementById("mapStage");
    const canvas = document.getElementById("mapPreview");
    const size = prepareGameCanvas(canvas, stage);
    if (!size || !canvas) return;
    renderMapView(canvas.getContext("2d"), state, {
        ...createLabMapViewConfig(options, { viewport, selectedNodeId }),
        width: size.width,
        height: size.height,
        viewport,
        labOptions: options,
        playerPos,
        targetPos,
        currentPath,
        abstractPath,
        drawOverlays: drawMapLabOverlays,
    });
    const statusLine = document.getElementById("mapStatusLine");
    if (statusLine)
        statusLine.textContent = `Cam: ${Math.round(viewport.x)}, ${Math.round(viewport.y)} · Zoom: ${viewport.zoom.toFixed(2)}x · ` + `Nodes: ${state.mapNodes.length} · Walls: ${state.walls.length}`;
}
