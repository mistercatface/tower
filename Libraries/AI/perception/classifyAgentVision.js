import { centerReachAabbInto, createAabb } from "../../Math/Aabb2D.js";
import { colRowToIndex } from "../../Spatial/grid/GridUtils.js";
import { kineticSpatial } from "../../../Systems/World/KineticSpatialFrame.js";
import { createObserverVisionFrame } from "../../Navigation/perception/observerVisionFrame.js";
const AGENT_VISION_QUERY_BOUNDS = createAabb();
/**
 * Single vision pass over alive agent heads — threat, prey/rival, and ally slots.
 * Allies are same-faction friendlies; they never occupy prey/threat.
 */
export function classifyAgentVisionInto(out, state, seeker, options = {}) {
    const instance = state.sandbox.snakeGame?.instancesByHeadId?.get(seeker.id) ?? null;
    const agentCtx = { instance, session: state.sandbox.snakeGame };
    const resolvedVision = seeker.visionRange ?? instance?.visionRange ?? state.nav?.observerVisionFrame?.visionRange ?? options.visionRange;
    const frame =
        state.nav?.observerVisionFrame ??
        (state.nav?.topology
            ? createObserverVisionFrame({ tickId: state.sandbox?.snakeGame?.simTick ?? 1, navTopology: state.nav.topology, visionRange: resolvedVision, viewport: state.viewport })
            : null);
    const vision = frame.ensureHeadVision(seeker, resolvedVision);
    const { visionRange = resolvedVision, agentRange = visionRange.range, resolveRelationship, trackPrey = true, committedTargetId = null, targetStickyFactor = 1.0 } = options;
    const navTopology = frame.navTopology;
    const range = agentRange ?? visionRange.range;
    const rangeSq = range * range;
    let threat = null;
    let prey = null;
    let ally = null;
    let bestThreatDistSq = Infinity;
    let bestPreyDistSq = Infinity;
    let bestAllyDistSq = Infinity;
    let threatCount = 0;
    let allyCount = 0;
    let allyCentroidX = 0;
    let allyCentroidY = 0;
    const bounds = centerReachAabbInto(AGENT_VISION_QUERY_BOUNDS, seeker.x, seeker.y, range);
    const candidates = state.entityRegistry.queryView({ bounds, kinds: ["worldProp"], hitTest: "center" }, kineticSpatial);
    for (let i = 0; i < candidates.length; i++) {
        const prop = candidates[i];
        const targetInstance = agentCtx.session.instancesByHeadId.get(prop.id);
        if (!targetInstance || targetInstance.lifecycle !== "alive") continue;
        if (targetInstance === agentCtx.instance) continue;
        const head = targetInstance.head;
        if (head !== prop || head.isDead) continue;
        const dx = head.x - seeker.x;
        const dy = head.y - seeker.y;
        const distSq = dx * dx + dy * dy;
        if (distSq > rangeSq) continue;
        const relationship = resolveRelationship(agentCtx.instance, targetInstance, state, distSq);
        if (relationship === "neutral") continue;
        const targetCol = navTopology.grid.worldCol(head.x);
        const targetRow = navTopology.grid.worldRow(head.y);
        if (!vision.cellSet.has(colRowToIndex(targetCol, targetRow, navTopology.grid.cols))) continue;
        let compareDistSq = distSq;
        if (committedTargetId !== null && head.id === committedTargetId) compareDistSq *= targetStickyFactor;
        if (relationship === "ally") {
            allyCount++;
            allyCentroidX += head.x;
            allyCentroidY += head.y;
            if (compareDistSq < bestAllyDistSq) {
                bestAllyDistSq = compareDistSq;
                ally = head;
            }
            continue;
        }
        const isThreat = relationship === "threat";
        if (isThreat) {
            threatCount++;
            if (compareDistSq < bestThreatDistSq) {
                bestThreatDistSq = compareDistSq;
                threat = head;
            }
            continue;
        }
        if (!trackPrey) continue;
        if (compareDistSq >= bestPreyDistSq) continue;
        bestPreyDistSq = compareDistSq;
        prey = head;
    }
    out.threat = threat;
    out.prey = prey;
    out.ally = ally;
    out.threatCount = threatCount;
    out.allyCount = allyCount;
    if (allyCount > 0) {
        if (!out.allyCentroid) out.allyCentroid = { x: 0, y: 0 };
        out.allyCentroid.x = allyCentroidX / allyCount;
        out.allyCentroid.y = allyCentroidY / allyCount;
    } else out.allyCentroid = null;
    return out;
}
export function classifyAgentVision(state, seeker, options = {}) {
    return classifyAgentVisionInto({ threat: null, prey: null, ally: null, threatCount: 0, allyCount: 0, allyCentroid: null }, state, seeker, options);
}
