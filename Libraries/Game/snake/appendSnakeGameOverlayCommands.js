import { getSnakeGameConfig } from "./snakeGameConfig.js";
import { appendFocusedAgentPathPreviewCommands } from "./focusedAgentPathOverlays.js";
import { appendFocusedAgentTargetOverlayCommands } from "./focusedAgentTargetOverlays.js";
import { appendFocusedAgentVisibleEntityOverlayCommands } from "./focusedAgentVisibleEntityOverlays.js";

export function createFocusedAgentDebugContext(instance, session) {
    if (!instance || instance.lifecycle !== "alive") return null;
    const head = instance.head;
    if (!head || head.isDead) return null;
    if (!instance.autosim || typeof instance.autosim.getBrain !== "function") return null;
    return { instance, session, head };
}

export function appendSnakeGameOverlayCommands(out, state, { focusedInstance }) {
    const config = getSnakeGameConfig();
    if (config.showFocusedAgentDebug !== true) return;
    const ctx = createFocusedAgentDebugContext(focusedInstance, state.sandbox.snakeGame);
    appendFocusedAgentVisibleEntityOverlayCommands(out, state, ctx, config);
    const pathOverlay = ctx.instance.autosim.getPathOverlay?.();
    if (pathOverlay) appendFocusedAgentPathPreviewCommands(out, pathOverlay, ctx.head.radius, config);
    appendFocusedAgentTargetOverlayCommands(out, state, ctx, config);
}
