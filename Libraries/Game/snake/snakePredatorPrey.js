import { queryGridCellVision } from "../../Navigation/perception/gridCellVision.js";
import { getSnakeGameConfig } from "./snakeGameConfig.js";
import { getSnakeSizeScore } from "./snakeScale.js";
import { isAliveSnakeHead } from "./snakeLifecycle.js";
export function collectAliveSnakeHeads(state, registry, selfHeadId) {
    const heads = [];
    for (const headId of registry.aliveByHeadId.keys()) {
        if (headId === selfHeadId) continue;
        if (!isAliveSnakeHead(registry, headId)) continue;
        const head = state.entityRegistry.getLive(headId);
        if (head && !head.isDead) heads.push(head);
    }
    return heads;
}
export function findNearestVisibleSnakePrey(state, seeker, selfHeadId, registry, visionCone = getSnakeGameConfig().visionCone) {
    const config = getSnakeGameConfig();
    const candidates = collectAliveSnakeHeads(state, registry, selfHeadId);
    const { visible } = queryGridCellVision(seeker, candidates, { ...visionCone, state });
    const selfScore = getSnakeSizeScore(state, selfHeadId);
    let nearest = null;
    let bestDist = Infinity;
    for (let i = 0; i < visible.length; i++) {
        const preyHead = visible[i];
        const preyScore = getSnakeSizeScore(state, preyHead.id);
        if (preyScore >= selfScore * config.preySizeRatio) continue;
        const dist = Math.hypot(preyHead.x - seeker.x, preyHead.y - seeker.y);
        if (dist < bestDist) {
            bestDist = dist;
            nearest = preyHead;
        }
    }
    return nearest;
}
export function findNearestVisibleSnakeThreat(state, seeker, selfHeadId, registry, visionCone = getSnakeGameConfig().visionCone) {
    const config = getSnakeGameConfig();
    const fleeRange = config.fleeRange ?? visionCone.range;
    const candidates = collectAliveSnakeHeads(state, registry, selfHeadId);
    const { visible } = queryGridCellVision(seeker, candidates, { ...visionCone, state });
    const selfScore = getSnakeSizeScore(state, selfHeadId);
    let nearest = null;
    let bestDist = Infinity;
    for (let i = 0; i < visible.length; i++) {
        const threatHead = visible[i];
        const threatScore = getSnakeSizeScore(state, threatHead.id);
        if (threatScore <= selfScore) continue;
        const dist = Math.hypot(threatHead.x - seeker.x, threatHead.y - seeker.y);
        if (dist > fleeRange) continue;
        if (dist < bestDist) {
            bestDist = dist;
            nearest = threatHead;
        }
    }
    return nearest;
}
export function resolveFleeNavTarget(seeker, threat, fleeMinDistance, state) {
    const dx = seeker.x - threat.x;
    const dy = seeker.y - threat.y;
    const len = Math.hypot(dx, dy) || 1;
    const targetX = seeker.x + (dx / len) * fleeMinDistance;
    const targetY = seeker.y + (dy / len) * fleeMinDistance;
    const grid = state.obstacleGrid;
    const cell = grid.worldToGrid(targetX, targetY);
    return grid.gridToWorld(cell.col, cell.row);
}
export function pickSnakeIntentTarget(seeker, selfHeadId, state, registry, resolveVisibleFood, visionCone) {
    const config = getSnakeGameConfig();
    const threat = findNearestVisibleSnakeThreat(state, seeker, selfHeadId, registry, visionCone);
    if (threat) return { mode: "flee", target: threat };
    const food = resolveVisibleFood(seeker, state);
    const prey = findNearestVisibleSnakePrey(state, seeker, selfHeadId, registry, visionCone);
    if (!food && !prey) return { mode: "explore", target: null };
    if (food && !prey) return { mode: "seek_food", target: food };
    if (prey && !food) return { mode: "seek_prey", target: prey };
    const foodDist = Math.max(Math.hypot(food.x - seeker.x, food.y - seeker.y), 1);
    const preyDist = Math.max(Math.hypot(prey.x - seeker.x, prey.y - seeker.y), 1);
    const foodScore = (1 - config.huntPriority) / foodDist;
    const preyScore = config.huntPriority / preyDist;
    if (preyScore > foodScore) return { mode: "seek_prey", target: prey };
    return { mode: "seek_food", target: food };
}
