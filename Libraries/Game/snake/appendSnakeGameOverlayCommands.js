import { getSnakeGameConfig } from "./snakeGameConfig.js";
import { resolveFocusedAgentDebugContext } from "./resolveFocusedAgentDebugContext.js";
import { appendFocusedAgentVisionOverlayCommands } from "./focusedAgentVisionOverlays.js";
import { appendFocusedAgentPathPreviewCommands } from "./focusedAgentPathOverlays.js";
import { appendFocusedAgentTargetOverlayCommands } from "./focusedAgentTargetOverlays.js";
import { appendSnakeMemoryHeatmapOverlayCommands } from "./snakeMemoryOverlays.js";
function resolveFocusedAgentDebugLayers(config) {
    const layers = config.focusedAgentDebug ?? {};
    return { vision: layers.vision !== false, spatialMemory: layers.spatialMemory !== false, path: layers.path !== false };
}
export function appendSnakeGameOverlayCommands(out, state, { focusedHeadId }) {
    const config = getSnakeGameConfig();
    if (config.showFocusedAgentDebug === false) return;
    const ctx = resolveFocusedAgentDebugContext(state, focusedHeadId);
    if (!ctx) return;
    const layers = resolveFocusedAgentDebugLayers(config);
    if (layers.vision) appendFocusedAgentVisionOverlayCommands(out, state, ctx);
    if (layers.spatialMemory) {
        const brain = ctx.getBrain();
        if (brain) appendSnakeMemoryHeatmapOverlayCommands(out, state, brain);
    }
    if (layers.path) {
        const pathOverlay = ctx.getPathOverlay();
        if (pathOverlay) appendFocusedAgentPathPreviewCommands(out, pathOverlay, ctx.head.radius, config);
    }
    appendFocusedAgentTargetOverlayCommands(out, state, ctx, config);
}
