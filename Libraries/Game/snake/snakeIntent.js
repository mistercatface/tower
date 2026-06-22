import { hasGridCellLineOfSightCached } from "../../Navigation/perception/gridCellVision.js";
import { getSnakeGameConfig } from "./snakeGameConfig.js";
import { requireSnakeVisionFrame } from "./snakePerception.js";
import { resolveAgentRelationship } from "./snakeAgentSession.js";
function classifyVisibleAgentsFromVision(seeker, selfHeadId, state, registry, frame, vision, visionCone = frame.visionCone) {
    const config = getSnakeGameConfig();
    const agentRange = config.fleeRange ?? visionCone.range;
    const navTopology = frame.navTopology;
    const visionSession = frame.visionSession;
    const rangeSq = agentRange * agentRange;
    const originCol = vision?.originCol ?? navTopology.grid.worldToGrid(seeker.x, seeker.y).col;
    const originRow = vision?.originRow ?? navTopology.grid.worldToGrid(seeker.x, seeker.y).row;
    let threat = null;
    let prey = null;
    let bestThreatDistSq = Infinity;
    let bestPreyDistSq = Infinity;
    const snakeGame = state.sandbox?.snakeGame;
    for (const headId of registry.aliveByHeadId.keys()) {
        if (headId === selfHeadId) continue;
        const head = state.entityRegistry.getLive(headId);
        if (!head || head.isDead) continue;
        const dx = head.x - seeker.x;
        const dy = head.y - seeker.y;
        const distSq = dx * dx + dy * dy;
        if (distSq > rangeSq) continue;
        const relationship = snakeGame ? resolveAgentRelationship(snakeGame, selfHeadId, headId, state) : "neutral";
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
    const config = getSnakeGameConfig();
    const cone = visionCone ?? config.visionCone;
    const vision = frame.readHeadVision(seeker, cone);
    const visionContext = { frame, vision, visionCone: cone };
    const agents = classifyVisibleAgentsFromVision(seeker, selfHeadId, state, registry, frame, vision, cone);
    const food = resolveVisibleFood(seeker, state, visionContext);
    const foodDist = food ? Math.hypot(food.x - seeker.x, food.y - seeker.y) / frame.navTopology.grid.cellSize : null;
    return { threat: agents.threat, prey: agents.prey, food, threatDist: agents.threatDist, preyDist: agents.preyDist, foodDist };
}
