import { renderMapView } from "../../Render/Map/MapViewRenderer.js";
import { createLabMapViewConfig } from "../../Render/Map/mapViewPresets.js";
import { drawMapLabOverlays } from "../../Render/Map/MapLabOverlays.js";

export function renderMapLabView(ctx, width, height, world, camera, options, selectedNodeId, playerPos, targetPos, currentPath) {
    renderMapView(ctx, world, {
        ...createLabMapViewConfig(options, { camera, selectedNodeId }),
        width,
        height,
        camera,
        labOptions: options,
        playerPos,
        targetPos,
        currentPath,
        drawOverlays: drawMapLabOverlays,
    });
}
