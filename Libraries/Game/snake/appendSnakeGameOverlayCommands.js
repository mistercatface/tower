import { getSnakeGameConfig } from "./snakeGameConfig.js";
import { resolveFocusedAgentDebugContext } from "./resolveFocusedAgentDebugContext.js";
import { appendFocusedAgentPathPreviewCommands } from "./focusedAgentPathOverlays.js";
import { appendFocusedAgentTargetOverlayCommands } from "./focusedAgentTargetOverlays.js";
import { appendFocusedAgentVisibleEntityOverlayCommands } from "./focusedAgentVisibleEntityOverlays.js";
export function appendSnakeGameOverlayCommands(out, state, { focusedHeadId }) {
    const config = getSnakeGameConfig();
    if (config.showFocusedAgentDebug !== true) return;
    const ctx = resolveFocusedAgentDebugContext(state, focusedHeadId);
    if (!ctx) return;
    appendFocusedAgentVisibleEntityOverlayCommands(out, state, ctx, config);
    const pathOverlay = ctx.getPathOverlay();
    if (pathOverlay) appendFocusedAgentPathPreviewCommands(out, pathOverlay, ctx.head.radius, config);
    appendFocusedAgentTargetOverlayCommands(out, state, ctx, config);
}
