import { getSharedConfig, getSnakeGameConfig } from "./snakeGameConfig.js";
import { requireSnakeVisionFrame } from "./snakePerception.js";
import { perceiveAgentIntentWorld } from "./agentIntentPerception.js";
import { appendGridCellVisionOverlayCommands } from "../../Navigation/perception/gridCellVisionOverlay.js";
import { overlayCircleFillStroke } from "../../Render/overlays/overlayCommands.js";
function resolveFocusedAgentDebugStyle(config) {
    return config.focusedAgentDebug ?? {};
}
function agentRingStyle(config, slot) {
    const slots = resolveFocusedAgentDebugStyle(config).agentSlots ?? {};
    const fallback = {
        threat: { fill: "rgba(255, 90, 90, 0.14)", stroke: "rgba(255, 120, 120, 0.55)", pad: 3 },
        prey: { fill: "rgba(255, 180, 60, 0.14)", stroke: "rgba(255, 220, 80, 0.55)", pad: 3 },
        ally: { fill: "rgba(100, 180, 255, 0.14)", stroke: "rgba(120, 220, 255, 0.55)", pad: 3 },
    };
    return { ...fallback[slot], ...slots[slot] };
}
function appendAgentVisionRing(out, agent, style) {
    if (!agent || agent.isDead) return;
    const radius = agent.radius ?? 3;
    const pad = style.pad ?? 3;
    out.push(overlayCircleFillStroke(agent.x, agent.y, radius + pad, { fill: style.fill, stroke: style.stroke, lineWidth: style.lineWidth ?? 1 }));
}
function perceiveFocusedAgentWorld(state, ctx) {
    const { head, headId, species } = ctx;
    const registry = state.sandbox.snakeGame.registry;
    const config = getSnakeGameConfig();
    const visionRange = getSharedConfig(config).visionRange;
    return perceiveAgentIntentWorld(head, headId, state, registry, () => null, visionRange);
}
export function appendFocusedAgentVisionOverlayCommands(out, state, ctx) {
    if (!ctx?.head) return;
    const config = getSnakeGameConfig();
    const visionRange = getSharedConfig(config).visionRange;
    const frame = requireSnakeVisionFrame(state);
    const vision = frame.ensureHeadVision(ctx.head, visionRange);
    appendGridCellVisionOverlayCommands(out, { grid: state.obstacleGrid, cells: vision.cells, cellFill: visionRange.cellFill });
    const world = perceiveFocusedAgentWorld(state, ctx);
    const intentTarget = ctx.getIntentTarget?.();
    const committedTargetId = intentTarget?.targetId ?? null;
    if (world.threat) appendAgentVisionRing(out, world.threat, agentRingStyle(config, "threat"));
    if (world.prey && world.prey.id !== committedTargetId) appendAgentVisionRing(out, world.prey, agentRingStyle(config, "prey"));
    if (world.ally) appendAgentVisionRing(out, world.ally, agentRingStyle(config, "ally"));
}
