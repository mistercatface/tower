import { hasGridCellLineOfSightCached } from "../../Navigation/perception/gridCellVision.js";
/**
 * Single vision pass over alive agent heads — threat, prey/rival, and ally slots.
 * Allies are same-faction friendlies; they never occupy prey/threat.
 */
export function classifyAgentVision(
    seeker,
    selfHeadId,
    state,
    registry,
    frame,
    vision,
    { visionRange = frame.visionRange, agentRange = visionRange.range, resolveRelationship, trackPrey = true } = {},
) {
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
    for (const headId of registry.aliveByHeadId.keys()) {
        if (headId === selfHeadId) continue;
        const head = state.entityRegistry.getLive(headId);
        if (!head || head.isDead) continue;
        const dx = head.x - seeker.x;
        const dy = head.y - seeker.y;
        const distSq = dx * dx + dy * dy;
        if (distSq > rangeSq) continue;
        const relationship = resolveRelationship(selfHeadId, headId, state, registry);
        if (relationship === "neutral") continue;
        const targetCol = navTopology.grid.worldCol(head.x);
        const targetRow = navTopology.grid.worldRow(head.y);
        if (!hasGridCellLineOfSightCached(visionSession, navTopology, originCol, originRow, targetCol, targetRow)) continue;
        if (relationship === "ally") {
            allyCount++;
            allyCentroidX += head.x;
            allyCentroidY += head.y;
            if (distSq < bestAllyDistSq) {
                bestAllyDistSq = distSq;
                ally = head;
            }
            continue;
        }
        const isThreat = relationship === "threat";
        if (isThreat) {
            threatCount++;
            if (distSq < bestThreatDistSq) {
                bestThreatDistSq = distSq;
                threat = head;
            }
            continue;
        }
        if (!trackPrey) continue;
        if (distSq >= bestPreyDistSq) continue;
        bestPreyDistSq = distSq;
        prey = head;
    }
    return { threat, prey, ally, threatCount, allyCount, allyCentroid: allyCount > 0 ? { x: allyCentroidX / allyCount, y: allyCentroidY / allyCount } : null };
}
