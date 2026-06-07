import { renderMapView } from "../../Games/tower/render/map/MapViewRenderer.js";
import { createLabMapViewConfig } from "../../Games/tower/render/map/mapViewPresets.js";
import { drawMapLabOverlays } from "../../Games/tower/render/map/MapLabOverlays.js";
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
