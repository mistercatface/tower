import { getDefaultSimulationZoom } from "../../Render/SimulationViewport.js";
import { clampZoom } from "./zoomMappings.js";
export const TILELAB_PREVIEW_RANGE = 160;
export const TILELAB_ZOOM_MIN = 0.25;
export const TILELAB_ZOOM_MAX = 2.5;
export const GAME_MODE_ZOOM_MULTIPLIER = 1.75;
export const GAME_MODE_ZOOM_MAX = 8;
export const GAME_MODE_ZOOM_DEFAULT = 5;
export function fitTileLabStageZoom(viewport, zoomMultiplier = 1, zoomMax = TILELAB_ZOOM_MAX) {
    const baseZoom = getDefaultSimulationZoom(viewport.width, viewport.height, TILELAB_PREVIEW_RANGE, TILELAB_PREVIEW_RANGE);
    viewport.zoom = clampZoom(TILELAB_ZOOM_MIN, zoomMax, baseZoom * zoomMultiplier);
}
export function fitGameModeStageZoom(viewport, zoom = GAME_MODE_ZOOM_DEFAULT) {
    viewport.zoom = clampZoom(TILELAB_ZOOM_MIN, GAME_MODE_ZOOM_MAX, zoom);
}
export function fitPlayStageZoom(viewport, session) {
    const sessionZoom = session?.initialViewportZoom;
    if (sessionZoom != null) fitGameModeStageZoom(viewport, sessionZoom);
    else fitTileLabStageZoom(viewport, GAME_MODE_ZOOM_MULTIPLIER, GAME_MODE_ZOOM_MAX);
}
