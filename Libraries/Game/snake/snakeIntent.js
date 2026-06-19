import { hasGridCellLineOfSight } from "../../Navigation/perception/gridCellVision.js";
import { cellChebyshevDistance } from "../../Navigation/steering/exploreSteering.js";
import { pickWalkableCell } from "../../Procedural/Mazes/walkableCells.js";
import { getSnakeGameConfig } from "./snakeGameConfig.js";
import { getSnakeSizeScore } from "./snakeScale.js";
function collectOtherSnakeHeads(state, registry, selfHeadId) {
    const heads = [];
    for (const headId of registry.aliveByHeadId.keys()) {
        if (headId === selfHeadId) continue;
        const head = state.entityRegistry.getLive(headId);
        if (!head || head.isDead) continue;
        heads.push(head);
    }
    return heads;
}
function visibleThreatInRange(seeker, threat, rangeSq, grid, selfCell) {
    if (!threat || threat.isDead) return null;
    const dx = threat.x - seeker.x;
    const dy = threat.y - seeker.y;
    const distSq = dx * dx + dy * dy;
    if (distSq > rangeSq) return null;
    if (grid && selfCell) {
        const threatCell = grid.worldToGrid(threat.x, threat.y);
        if (!hasGridCellLineOfSight(grid, selfCell.col, selfCell.row, threatCell.col, threatCell.row)) return null;
    }
    return Math.sqrt(distSq);
}
export function findNearestVisibleThreat(seeker, selfHeadId, state, registry, visionCone = getSnakeGameConfig().visionCone) {
    const config = getSnakeGameConfig();
    const range = config.fleeRange ?? visionCone.range;
    const rangeSq = range * range;
    const candidates = collectOtherSnakeHeads(state, registry, selfHeadId);
    const selfScore = getSnakeSizeScore(state, selfHeadId);
    const grid = state.obstacleGrid;
    const selfCell = grid ? grid.worldToGrid(seeker.x, seeker.y) : null;
    let nearest = null;
    let bestDist = Infinity;
    for (let i = 0; i < candidates.length; i++) {
        const head = candidates[i];
        if (getSnakeSizeScore(state, head.id) <= selfScore) continue;
        const dist = visibleThreatInRange(seeker, head, rangeSq, grid, selfCell);
        if (dist == null || dist >= bestDist) continue;
        bestDist = dist;
        nearest = head;
    }
    const snakeGame = state.sandbox.snakeGame;
    if (snakeGame) {
        const strikerDist = visibleThreatInRange(seeker, snakeGame.strikerBall, rangeSq, grid, selfCell);
        if (strikerDist != null && strikerDist < bestDist) nearest = snakeGame.strikerBall;
    }
    return nearest;
}
export function perceiveSnakeIntentWorld(seeker, selfHeadId, state, registry, resolveVisibleFood, visionCone = getSnakeGameConfig().visionCone) {
    return {
        threat: findNearestVisibleThreat(seeker, selfHeadId, state, registry, visionCone),
        food: resolveVisibleFood(seeker, state),
    };
}
export function pickSnakeIntentPolicy(world) {
    if (world.threat) return { mode: "flee", targetId: null };
    if (world.food) return { mode: "seek_food", targetId: world.food.id };
    return { mode: "explore", targetId: null };
}
export function pickFleeCell(seeker, threat, grid, navWalkable, fleeTiles = getSnakeGameConfig().fleeTiles) {
    const selfCell = grid.worldToGrid(seeker.x, seeker.y);
    const threatCell = grid.worldToGrid(threat.x, threat.y);
    let dCol = selfCell.col - threatCell.col;
    let dRow = selfCell.row - threatCell.row;
    if (dCol === 0 && dRow === 0) dCol = 1;
    const scale = fleeTiles / Math.max(Math.abs(dCol), Math.abs(dRow), 1);
    const awayCol = selfCell.col + Math.round(dCol * scale);
    const awayRow = selfCell.row + Math.round(dRow * scale);
    if (navWalkable.has(awayCol, awayRow)) return { col: awayCol, row: awayRow };
    const openCells = navWalkable.cells();
    let best = null;
    let bestAway = -Infinity;
    for (let i = 0; i < openCells.length; i++) {
        const cell = openCells[i];
        if (cell.col === selfCell.col && cell.row === selfCell.row) continue;
        const away = cellChebyshevDistance(cell.col, cell.row, threatCell.col, threatCell.row) - cellChebyshevDistance(selfCell.col, selfCell.row, threatCell.col, threatCell.row);
        if (away > bestAway) {
            bestAway = away;
            best = cell;
        }
    }
    return best ?? pickWalkableCell(openCells, { rng: Math.random });
}
function policyToIntentChoice(state, policy) {
    if (policy.mode === "explore" || policy.mode === "flee") return { mode: policy.mode, target: null };
    const target = state.entityRegistry.getLive(policy.targetId);
    if (!target || target.isDead) return { mode: "explore", target: null };
    return { mode: policy.mode, target };
}
export function pickSnakeIntentTarget(seeker, selfHeadId, state, registry, resolveVisibleFood, visionCone) {
    const world = perceiveSnakeIntentWorld(seeker, selfHeadId, state, registry, resolveVisibleFood, visionCone);
    return policyToIntentChoice(state, pickSnakeIntentPolicy(world));
}
