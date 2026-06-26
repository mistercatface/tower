import { classifyAgentVision } from "../../AI/perception/classifyAgentVision.js";
import { resolveRelationshipForInstances } from "./agentRelationships.js";
import { requireSnakeVisionFrame } from "./snakePerception.js";
import { overlayCircleFillStroke } from "../../Render/overlays/overlayCommands.js";
import { createObserverVisionFrame } from "../../Navigation/perception/observerVisionFrame.js";
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
export function appendFocusedAgentVisibleEntityOverlayCommands(out, state, session) {
    const config = session.config;
    const shared = config.shared;
    const prop = state.followCamera?.targetProp;
    if (!prop) return;
    const instance = session.instancesByHeadId.get(prop.id);
    const head = instance?.head;
    if (!head) return;
    const visionRange = instance.visionRange;
    const frame = state.nav.observerVisionFrame ?? createObserverVisionFrame({ tickId: session.simTick ?? 1, navTopology: state.nav.topology, visionRange, viewport: state.viewport });
    const agentCtx = { instance, session };
    const committedTargetId = instance.intent.getTargetId();
    const perceptionOptions = {
        readVisionFrame: requireSnakeVisionFrame,
        agentRange: shared.fleeRange ?? visionRange.range,
        resolveRelationship: (selfInstance, targetInstance, _gameState, distSq) => resolveRelationshipForInstances(selfInstance, targetInstance, distSq),
        committedTargetId,
        targetStickyFactor: shared.targetingHysteresis.targetStickyFactor ?? 0.75,
    };
    const vision = frame.ensureHeadVision(head, visionRange);
    const world = classifyAgentVision(head, agentCtx, state, frame, vision, perceptionOptions);
    if (world.threat) appendAgentRing(out, world.threat, agentRingStyle(config, "threat"));
    if (world.prey && world.prey.id !== committedTargetId) appendAgentRing(out, world.prey, agentRingStyle(config, "prey"));
    if (world.ally) appendAgentRing(out, world.ally, agentRingStyle(config, "ally"));
}
