import { renderMapView } from "../../Render/Map/MapViewRenderer.js";
import { createLabMapViewConfig } from "../../Render/Map/mapViewPresets.js";
import { drawMapLabOverlays } from "../../Render/Map/MapLabOverlays.js";

export function renderMapLabView(ctx, width, height, world, viewport, options, selectedNodeId, playerPos, targetPos, currentPath, abstractPath) {
    renderMapView(ctx, world, {
        ...createLabMapViewConfig(options, { viewport, selectedNodeId }),
        width,
        height,
        viewport,
        labOptions: options,
        playerPos,
        targetPos,
        currentPath,
        abstractPath,
        drawOverlays: drawMapLabOverlays,
    });
}
