import { centerReachAabbInto, createAabb } from "../../Math/Aabb2D.js";
import { hasGridCellLineOfSightCached } from "../../Navigation/perception/gridCellVision.js";
import { kineticSpatial } from "../../../Systems/World/KineticSpatialFrame.js";

const AGENT_VISION_QUERY_BOUNDS = createAabb();

/**
 * Single vision pass over alive agent heads — threat, prey/rival, and ally slots.
 * Allies are same-faction friendlies; they never occupy prey/threat.
 */
export function classifyAgentVision(seeker, agentCtx, state, frame, vision, options = {}) {
    const { visionRange = frame.visionRange, agentRange = visionRange.range, resolveRelationship, trackPrey = true, committedTargetId = null, targetStickyFactor = 1.0 } = options;
    const navTopology = frame.navTopology;
    const visionSession = frame.visionSession;
    const range = agentRange ?? visionRange.range;
    const rangeSq = range * range;
    const originCol = vision?.originCol ?? navTopology.grid.worldCol(seeker.x);
    const originRow = vision?.originRow ?? navTopology.grid.worldRow(seeker.y);
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
        if (!hasGridCellLineOfSightCached(visionSession, navTopology, originCol, originRow, targetCol, targetRow)) continue;
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
    return { threat, prey, ally, threatCount, allyCount, allyCentroid: allyCount > 0 ? { x: allyCentroidX / allyCount, y: allyCentroidY / allyCount } : null };
}
