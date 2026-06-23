import { hasGridCellLineOfSightCached } from "../../Navigation/perception/gridCellVision.js";
function threatSeverityForDist(dist, fleeRange) {
    return Math.max(0, Math.min(1, (fleeRange - dist) / fleeRange));
}
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
    const originCol = vision?.originCol ?? navTopology.grid.worldToGrid(seeker.x, seeker.y).col;
    const originRow = vision?.originRow ?? navTopology.grid.worldToGrid(seeker.x, seeker.y).row;
    let threat = null;
    let prey = null;
    let ally = null;
    let bestThreatDistSq = Infinity;
    let bestPreyDistSq = Infinity;
    let bestAllyDistSq = Infinity;
    let threatCount = 0;
    let aggregateThreatSeverity = 0;
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
        const targetCell = navTopology.grid.worldToGrid(head.x, head.y);
        if (!hasGridCellLineOfSightCached(visionSession, navTopology, originCol, originRow, targetCell.col, targetCell.row)) continue;
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
            const dist = Math.sqrt(distSq);
            threatCount++;
            aggregateThreatSeverity += threatSeverityForDist(dist, range);
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
    return {
        threat,
        prey,
        ally,
        threatDist: threat ? Math.sqrt(bestThreatDistSq) : null,
        preyDist: prey ? Math.sqrt(bestPreyDistSq) / navTopology.grid.cellSize : null,
        allyDist: ally ? Math.sqrt(bestAllyDistSq) / navTopology.grid.cellSize : null,
        threatCount,
        aggregateThreatSeverity,
        allyCount,
        allyCentroid: allyCount > 0 ? { x: allyCentroidX / allyCount, y: allyCentroidY / allyCount } : null,
    };
}
