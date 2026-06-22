import { hasGridCellLineOfSightCached } from "../../Navigation/perception/gridCellVision.js";
import { getSnakeGameConfig } from "./snakeGameConfig.js";
import { requireSnakeVisionFrame } from "./snakePerception.js";
import { getAgentRelationship } from "./agentPopulationRegistry.js";
function classifyVisibleAgentsFromVision(seeker, selfHeadId, state, registry, frame, vision, visionCone = frame.visionCone) {
    const navTopology = frame.navTopology;
    const visionSession = frame.visionSession;
    const config = getSnakeGameConfig();
    const range = config.fleeRange ?? visionCone.range;
    const rangeSq = range * range;
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
        const relationship = getAgentRelationship(selfHeadId, headId, state, registry);
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
function findNearestVisibleThreatFromVision(seeker, selfHeadId, state, registry, frame, vision, visionCone = frame.visionCone) {
    return classifyVisibleAgentsFromVision(seeker, selfHeadId, state, registry, frame, vision, visionCone).threat;
}
export function findNearestVisibleThreat(seeker, selfHeadId, state, registry, visionCone) {
    const frame = requireSnakeVisionFrame(state);
    const cone = visionCone ?? frame.visionCone;
    const vision = frame.readHeadVision(seeker, cone);
    return findNearestVisibleThreatFromVision(seeker, selfHeadId, state, registry, frame, vision, cone);
}
export function perceiveSnakeIntentWorld(seeker, selfHeadId, state, registry, resolveVisibleFood, visionCone) {
    const frame = requireSnakeVisionFrame(state);
    const cone = visionCone ?? frame.visionCone;
    const vision = frame.readHeadVision(seeker, cone);
    const visionContext = { frame, vision, visionCone: cone };
    const snakes = classifyVisibleAgentsFromVision(seeker, selfHeadId, state, registry, frame, vision, cone);
    const food = resolveVisibleFood(seeker, state, visionContext);
    const foodDist = food ? Math.hypot(food.x - seeker.x, food.y - seeker.y) / frame.navTopology.grid.cellSize : null;
    return { threat: snakes.threat, prey: snakes.prey, food, threatDist: snakes.threatDist, preyDist: snakes.preyDist, foodDist };
}
export function pickFleeCell(seeker, threat, grid, navWalkable, fleeTiles = getSnakeGameConfig().fleeTiles, avoidCell = null) {
    const sameCell = (a, b) => a && b && a.col === b.col && a.row === b.row;
    const selfCell = grid.worldToGrid(seeker.x, seeker.y);
    const threatCell = grid.worldToGrid(threat.x, threat.y);
    let dCol = selfCell.col - threatCell.col;
    let dRow = selfCell.row - threatCell.row;
    if (dCol === 0 && dRow === 0) dCol = 1;
    const scale = fleeTiles / Math.max(Math.abs(dCol), Math.abs(dRow), 1);
    const awayCol = selfCell.col + Math.round(dCol * scale);
    const awayRow = selfCell.row + Math.round(dRow * scale);
    const ideal = { col: awayCol, row: awayRow };
    if (navWalkable.has(awayCol, awayRow) && !sameCell(ideal, avoidCell)) return ideal;
    return null;
}
