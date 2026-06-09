import { drawMapViewInWorld } from "../MapViewRenderer.js";
import { createTopologyMapViewConfig } from "./topologyMapPresets.js";
import { TOPOLOGY_MAP_GRAPH_STYLES } from "./topologyMapStyles.js";
import { drawTopologyOverlays } from "./topologyOverlays.js";
/**
 * @typedef {Object} TopologySession
 * @property {number | null} selectedNodeId
 */
/**
 * Roguelike topology graph + debug overlays in world space.
 * Caller must have already applied the viewport transform to `ctx`.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} state
 * @param {import("../../../Viewport/Viewport.js").Viewport} viewport
 * @param {import("./topologyMapPresets.js").TopologyDisplayOptions} displayOptions
 * @param {TopologySession} session
 * @param {{ overlay?: boolean }} [options]
 */
export function drawTopologyLayer(ctx, state, viewport, displayOptions, session, { overlay = false } = {}) {
    drawMapViewInWorld(ctx, state, {
        ...createTopologyMapViewConfig(displayOptions, { viewport, selectedNodeId: session.selectedNodeId }),
        graphStyles: TOPOLOGY_MAP_GRAPH_STYLES,
        wallCache: state.mapTopologyWallCache,
        viewport,
        topologyOptions: displayOptions,
        drawOverlays: drawTopologyOverlays,
        overlay,
    });
}
