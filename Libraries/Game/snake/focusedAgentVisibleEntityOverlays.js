import { classifyAgentVision } from "../../AI/perception/classifyAgentVision.js";
import { getSharedConfig, getSnakeGameConfig } from "./snakeGameConfig.js";
import { resolveAgentPerceptionOptions } from "./agentIntentPerception.js";
import { getSessionFocusedInstance } from "./snakeAgentCameraFocus.js";
import { overlayCircleFillStroke } from "../../Render/overlays/overlayCommands.js";
function agentRingStyle(config, slot) {
    const slots = config.focusedAgentDebug?.agentSlots ?? {};
    const fallback = {
        threat: { fill: "rgba(255, 90, 90, 0.14)", stroke: "rgba(255, 120, 120, 0.55)", pad: 3 },
        prey: { fill: "rgba(255, 180, 60, 0.14)", stroke: "rgba(255, 220, 80, 0.55)", pad: 3 },
        ally: { fill: "rgba(100, 180, 255, 0.14)", stroke: "rgba(120, 220, 255, 0.55)", pad: 3 },
    };
    return { ...fallback[slot], ...slots[slot] };
}
function appendAgentRing(out, agent, style) {
    if (!agent || agent.isDead) return;
    const radius = agent.radius ?? 3;
    const pad = style.pad ?? 3;
    out.push(overlayCircleFillStroke(agent.x, agent.y, radius + pad, { fill: style.fill, stroke: style.stroke, lineWidth: style.lineWidth ?? 1 }));
}
/** Read-only visible threat/prey/ally rings — same LOS pass as combat, no vision cache or sim tick. */
export function appendFocusedAgentVisibleEntityOverlayCommands(out, state, session, config = getSnakeGameConfig()) {
    const instance = getSessionFocusedInstance(session);
    const head = instance?.head;
    if (!head) return;
    const visionRange = getSharedConfig(config).visionRange;
    const frame = { navTopology: state.nav.topology, visionSession: null, visionRange };
    const perceptionOptions = resolveAgentPerceptionOptions(state, visionRange);
    const agentCtx = { instance, session };
    const world = classifyAgentVision(head, agentCtx, state, frame, null, perceptionOptions);
    const committedTargetId = instance.intent?.getTargetId?.() ?? null;
    if (world.threat) appendAgentRing(out, world.threat, agentRingStyle(config, "threat"));
    if (world.prey && world.prey.id !== committedTargetId) appendAgentRing(out, world.prey, agentRingStyle(config, "prey"));
    if (world.ally) appendAgentRing(out, world.ally, agentRingStyle(config, "ally"));
}
