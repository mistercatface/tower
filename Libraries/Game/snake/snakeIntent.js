import { hasGridCellLineOfSightCached } from "../../Navigation/perception/gridCellVision.js";
import { getSnakeGameConfig } from "./snakeGameConfig.js";
import { getSnakeSizeScore } from "./snakeScale.js";
import { requireSnakeVisionFrame } from "./snakePerception.js";
function visibleTargetInRange(seeker, target, rangeSq, navTopology, originCol, originRow, visionSession) {
    if (!target || target.isDead) return null;
    const dx = target.x - seeker.x;
    const dy = target.y - seeker.y;
    const distSq = dx * dx + dy * dy;
    if (distSq > rangeSq) return null;
    const targetCell = navTopology.grid.worldToGrid(target.x, target.y);
    if (!hasGridCellLineOfSightCached(visionSession, navTopology, originCol, originRow, targetCell.col, targetCell.row)) return null;
    return Math.sqrt(distSq);
}
function classifyVisibleSnakeHeadsFromVision(seeker, selfHeadId, state, registry, frame, vision, visionCone = frame.visionCone) {
    const navTopology = frame.navTopology;
    const visionSession = frame.visionSession;
    const config = getSnakeGameConfig();
    const range = config.fleeRange ?? visionCone.range;
    const rangeSq = range * range;
    const originCol = vision?.originCol ?? navTopology.grid.worldToGrid(seeker.x, seeker.y).col;
    const originRow = vision?.originRow ?? navTopology.grid.worldToGrid(seeker.x, seeker.y).row;
    const selfScore = getSnakeSizeScore(state, selfHeadId);
    let threat = null;
    let prey = null;
    let bestThreatDist = Infinity;
    let bestPreyDist = Infinity;
    for (const headId of registry.aliveByHeadId.keys()) {
        if (headId === selfHeadId) continue;
        const head = state.entityRegistry.getLive(headId);
        if (!head || head.isDead) continue;
        const score = getSnakeSizeScore(state, head.id);
        if (score === selfScore) continue;
        const dist = visibleTargetInRange(seeker, head, rangeSq, navTopology, originCol, originRow, visionSession);
        if (dist == null) continue;
        if (score > selfScore) {
            if (dist >= bestThreatDist) continue;
            bestThreatDist = dist;
            threat = head;
        } else if (dist < bestPreyDist) {
            bestPreyDist = dist;
            prey = head;
        }
    }
    const snakeGame = state.sandbox.snakeGame;
    if (snakeGame) {
        const strikerDist = visibleTargetInRange(seeker, snakeGame.strikerBall, rangeSq, navTopology, originCol, originRow, visionSession);
        if (strikerDist != null && strikerDist < bestThreatDist) {
            threat = snakeGame.strikerBall;
            bestThreatDist = strikerDist;
        }
    }
    return { threat, prey, threatDist: threat ? bestThreatDist : null, preyDist: prey ? bestPreyDist / navTopology.grid.cellSize : null };
}
function findNearestVisibleThreatFromVision(seeker, selfHeadId, state, registry, frame, vision, visionCone = frame.visionCone) {
    return classifyVisibleSnakeHeadsFromVision(seeker, selfHeadId, state, registry, frame, vision, visionCone).threat;
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
    const snakes = classifyVisibleSnakeHeadsFromVision(seeker, selfHeadId, state, registry, frame, vision, cone);
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
