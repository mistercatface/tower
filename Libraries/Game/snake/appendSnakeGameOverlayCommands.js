import { getSnakeGameConfig } from "./snakeGameConfig.js";
import { resolveFocusedAgentDebugContext } from "./resolveFocusedAgentDebugContext.js";
import { appendFocusedAgentPathPreviewCommands } from "./focusedAgentPathOverlays.js";
export function appendSnakeGameOverlayCommands(out, state, { focusedHeadId }) {
    const config = getSnakeGameConfig();
    if (config.showFocusedAgentDebug !== true) return;
    const ctx = resolveFocusedAgentDebugContext(state, focusedHeadId);
    if (!ctx) return;
    const pathOverlay = ctx.getPathOverlay();
    if (pathOverlay) appendFocusedAgentPathPreviewCommands(out, pathOverlay, ctx.head.radius, config);
}
