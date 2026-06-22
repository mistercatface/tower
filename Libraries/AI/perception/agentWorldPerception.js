import { hasGridCellLineOfSightCached } from "../../Navigation/perception/gridCellVision.js";
export function classifyVisibleAgentsFromVision(seeker, selfHeadId, state, registry, frame, vision, { visionCone = frame.visionCone, agentRange = visionCone.range, resolveRelationship }) {
    const navTopology = frame.navTopology;
    const visionSession = frame.visionSession;
    const rangeSq = agentRange * agentRange;
    const originCol = vision?.originCol ?? navTopology.grid.worldToGrid(seeker.x, seeker.y).col;
    const originRow = vision?.originRow ?? navTopology.grid.worldToGrid(seeker.x, seeker.y).row;
    let threat = null;
    let prey = null;
    let bestThreatDistSq = Infinity;
    let bestPreyDistSq = Infinity;
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
        const isThreat = relationship === "threat";
        if (isThreat && distSq >= bestThreatDistSq) continue;
        if (!isThreat && distSq >= bestPreyDistSq) continue;
        const targetCell = navTopology.grid.worldToGrid(head.x, head.y);
        if (!hasGridCellLineOfSightCached(visionSession, navTopology, originCol, originRow, targetCell.col, targetCell.row)) continue;
        if (isThreat) {
            bestThreatDistSq = distSq;
            threat = head;
        } else {
            bestPreyDistSq = distSq;
            prey = head;
        }
    }
    return { threat, prey, threatDist: threat ? Math.sqrt(bestThreatDistSq) : null, preyDist: prey ? Math.sqrt(bestPreyDistSq) / navTopology.grid.cellSize : null };
}
export function findNearestVisibleThreatFromVision(seeker, selfHeadId, state, registry, frame, vision, perceptionOptions) {
    return classifyVisibleAgentsFromVision(seeker, selfHeadId, state, registry, frame, vision, perceptionOptions).threat;
}
export function findNearestVisibleThreat(seeker, selfHeadId, state, registry, visionCone, { readVisionFrame, agentRange, resolveRelationship }) {
    const frame = readVisionFrame(state);
    const cone = visionCone ?? frame.visionCone;
    const vision = frame.readHeadVision(seeker, cone);
    const range = agentRange ?? cone.range;
    return findNearestVisibleThreatFromVision(seeker, selfHeadId, state, registry, frame, vision, { visionCone: cone, agentRange: range, resolveRelationship });
}
export function perceiveAgentWorld(seeker, selfHeadId, state, registry, resolveVisibleFood, visionCone, { readVisionFrame, agentRange, resolveRelationship }) {
    const frame = readVisionFrame(state);
    const cone = visionCone ?? frame.visionCone;
    const vision = frame.readHeadVision(seeker, cone);
    const range = agentRange ?? cone.range;
    const visionContext = { frame, vision, visionCone: cone };
    const agents = classifyVisibleAgentsFromVision(seeker, selfHeadId, state, registry, frame, vision, { visionCone: cone, agentRange: range, resolveRelationship });
    const food = resolveVisibleFood(seeker, state, visionContext);
    const foodDist = food ? Math.hypot(food.x - seeker.x, food.y - seeker.y) / frame.navTopology.grid.cellSize : null;
    return { threat: agents.threat, prey: agents.prey, food, threatDist: agents.threatDist, preyDist: agents.preyDist, foodDist };
}
