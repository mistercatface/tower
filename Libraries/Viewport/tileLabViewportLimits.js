import { getDefaultSimulationZoom } from "../../Render/SimulationViewport.js";
import { clampZoom } from "./zoomMappings.js";
export const TILELAB_PREVIEW_RANGE = 160;
export const TILELAB_ZOOM_MIN = 0.25;
export const TILELAB_ZOOM_MAX = 2.5;
export const GAME_MODE_ZOOM_MULTIPLIER = 1.75;
export const GAME_MODE_ZOOM_MAX = 8;
export function fitTileLabStageZoom(viewport, zoomMultiplier = 1, zoomMax = TILELAB_ZOOM_MAX) {
    const baseZoom = getDefaultSimulationZoom(viewport.width, viewport.height, TILELAB_PREVIEW_RANGE, TILELAB_PREVIEW_RANGE);
    viewport.zoom = clampZoom(TILELAB_ZOOM_MIN, zoomMax, baseZoom * zoomMultiplier);
}
