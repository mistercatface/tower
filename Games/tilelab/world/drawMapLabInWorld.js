import { drawMapViewInWorld } from "../../../Libraries/Render/map/MapViewRenderer.js";
import { createTopologyMapViewConfig } from "../render/topologyMapPresets.js";
import { TOPOLOGY_MAP_GRAPH_STYLES } from "../render/topologyMapStyles.js";
import { drawTopologyOverlays } from "../render/topologyOverlays.js";
/**
 * MapLab graph + inspector overlays in the same world space as the 3D surface preview.
 * Caller must have already applied the world viewport transform to `ctx`.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {import("../TileLabGameState.js").TileLabGameState} state
 * @param {import("../../../Libraries/Viewport/Viewport.js").Viewport} viewport
 * @param {ReturnType<import("../ui/mapInspector.js").readMapControls>} topologyOptions
 * @param {import("../TileLabGameState.js").TileLabGameState["mapLab"]} mapLab
 */
export function drawMapLabInWorld(ctx, state, viewport, topologyOptions, mapLab) {
    drawMapViewInWorld(ctx, state, {
        ...createTopologyMapViewConfig(topologyOptions, { viewport, selectedNodeId: mapLab.selectedNodeId }),
        graphStyles: TOPOLOGY_MAP_GRAPH_STYLES,
        wallCache: state.mapTopologyWallCache,
        viewport,
        topologyOptions,
        playerPos: mapLab.playerPos,
        targetPos: mapLab.targetPos,
        currentPath: mapLab.currentPath,
        abstractPath: mapLab.currentAbstractPath,
        drawOverlays: drawTopologyOverlays,
    });
}
