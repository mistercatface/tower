import { hasGridCellLineOfSightCached } from "../../../Navigation/perception/gridCellVision.js";
import { getSnakeGameConfig } from "../snakeGameConfig.js";
function threatSeverityForDist(dist, fleeRange) {
    return Math.max(0, Math.min(1, (fleeRange - dist) / fleeRange));
}
export function classifyFleeVisibleAgentsFromVision(seeker, selfHeadId, state, registry, frame, vision, { visionCone = frame.visionCone, agentRange = visionCone.range, resolveRelationship }) {
    const navTopology = frame.navTopology;
    const visionSession = frame.visionSession;
    const fleeRange = agentRange ?? visionCone.range;
    const rangeSq = fleeRange * fleeRange;
    const originCol = vision?.originCol ?? navTopology.grid.worldToGrid(seeker.x, seeker.y).col;
    const originRow = vision?.originRow ?? navTopology.grid.worldToGrid(seeker.x, seeker.y).row;
    let threat = null;
    let prey = null;
    let bestThreatDistSq = Infinity;
    let bestPreyDistSq = Infinity;
    let threatCount = 0;
    let aggregateThreatSeverity = 0;
    for (const headId of registry.aliveByHeadId.keys()) {
        if (headId === selfHeadId) continue;
        const head = state.entityRegistry.getLive(headId);
        if (!head || head.isDead) continue;
        const dx = head.x - seeker.x;
        const dy = head.y - seeker.y;
        const distSq = dx * dx + dy * dy;
        if (distSq > rangeSq) continue;
        const relationship = resolveRelationship(selfHeadId, headId, state, registry);
        if (relationship === "neutral" || relationship === "ally") continue;
        const targetCell = navTopology.grid.worldToGrid(head.x, head.y);
        if (!hasGridCellLineOfSightCached(visionSession, navTopology, originCol, originRow, targetCell.col, targetCell.row)) continue;
        const dist = Math.sqrt(distSq);
        if (relationship === "threat") {
            threatCount++;
            aggregateThreatSeverity += threatSeverityForDist(dist, fleeRange);
            if (distSq < bestThreatDistSq) {
                bestThreatDistSq = distSq;
                threat = head;
            }
            continue;
        }
        if (distSq >= bestPreyDistSq) continue;
        bestPreyDistSq = distSq;
        prey = head;
    }
    return {
        threat,
        prey,
        threatDist: threat ? Math.sqrt(bestThreatDistSq) : null,
        preyDist: prey ? Math.sqrt(bestPreyDistSq) / navTopology.grid.cellSize : null,
        threatCount,
        aggregateThreatSeverity,
    };
}
export function perceiveFleeAgentWorld(seeker, selfHeadId, state, registry, resolveVisibleFood, visionCone, { readVisionFrame, agentRange, resolveRelationship }) {
    const frame = readVisionFrame(state);
    const cone = visionCone ?? frame.visionCone;
    const vision = frame.readHeadVision(seeker, cone);
    const config = getSnakeGameConfig();
    const range = agentRange ?? config.fleeRange ?? cone.range;
    const visionContext = { frame, vision, visionCone: cone };
    const agents = classifyFleeVisibleAgentsFromVision(seeker, selfHeadId, state, registry, frame, vision, { visionCone: cone, agentRange: range, resolveRelationship });
    const food = resolveVisibleFood(seeker, state, visionContext);
    const foodDist = food ? Math.hypot(food.x - seeker.x, food.y - seeker.y) / frame.navTopology.grid.cellSize : null;
    return { ...agents, food, foodDist };
}
