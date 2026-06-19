import { queryGridCellVision } from "../../Navigation/perception/gridCellVision.js";
import { cellChebyshevDistance } from "../../Navigation/steering/exploreSteering.js";
import { pickWalkableCell } from "../../Procedural/Mazes/walkableCells.js";
import { collectSnakeWaypointCandidates } from "./snakeExplore.js";
import { getSnakeGameConfig } from "./snakeGameConfig.js";
import { getSnakeSizeScore } from "./snakeScale.js";
export function collectAliveSnakeHeads(state, registry, selfHeadId) {
    const heads = [];
    for (const headId of registry.aliveByHeadId.keys()) {
        if (headId === selfHeadId) continue;
        const head = state.entityRegistry.getLive(headId);
        if (!head || head.isDead) continue;
        if (!registry.aliveByHeadId.has(headId)) continue;
        heads.push(head);
    }
    return heads;
}
export function normalizeSnakeIntentChoice(choice, registry) {
    if (choice.mode === "seek_prey") {
        const target = choice.target;
        if (!target || target.isDead || !registry.aliveByHeadId.has(target.id)) return { mode: "explore", target: null };
    }
    if (choice.mode === "seek_food") {
        const target = choice.target;
        if (!target || target.isDead) return { mode: "explore", target: null };
    }
    return choice;
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
export function collectVisibleSnakeThreats(state, seeker, selfHeadId, registry, visionCone = getSnakeGameConfig().visionCone) {
    const config = getSnakeGameConfig();
    const fleeRange = config.fleeRange ?? visionCone.range;
    const candidates = collectAliveSnakeHeads(state, registry, selfHeadId);
    const { visible } = queryGridCellVision(seeker, candidates, { ...visionCone, state });
    const selfScore = getSnakeSizeScore(state, selfHeadId);
    const threats = [];
    for (let i = 0; i < visible.length; i++) {
        const threatHead = visible[i];
        const threatScore = getSnakeSizeScore(state, threatHead.id);
        if (threatScore <= selfScore) continue;
        const dist = Math.hypot(threatHead.x - seeker.x, threatHead.y - seeker.y);
        if (dist > fleeRange) continue;
        threats.push(threatHead);
    }
    return threats;
}
export function findNearestVisibleSnakeThreat(state, seeker, selfHeadId, registry, visionCone = getSnakeGameConfig().visionCone) {
    const threats = collectVisibleSnakeThreats(state, seeker, selfHeadId, registry, visionCone);
    let nearest = null;
    let bestDist = Infinity;
    for (let i = 0; i < threats.length; i++) {
        const threatHead = threats[i];
        const dist = Math.hypot(threatHead.x - seeker.x, threatHead.y - seeker.y);
        if (dist < bestDist) {
            bestDist = dist;
            nearest = threatHead;
        }
    }
    return nearest;
}
export function pickRetreatDestination(seeker, state, registry, selfHeadId, memory, rng, navWalkable, visionCone = getSnakeGameConfig().visionCone) {
    const threats = collectVisibleSnakeThreats(state, seeker, selfHeadId, registry, visionCone);
    if (!threats.length) return null;
    const config = getSnakeGameConfig();
    const grid = state.obstacleGrid;
    const { col, row } = grid.worldToGrid(seeker.x, seeker.y);
    const openCells = navWalkable.cells();
    let minTiles = config.exploreMinTiles;
    let candidates = collectSnakeWaypointCandidates(grid, col, row, minTiles, openCells);
    if (!candidates.length && minTiles > config.exploreFallbackMinTiles) {
        minTiles = config.exploreFallbackMinTiles;
        candidates = collectSnakeWaypointCandidates(grid, col, row, minTiles, openCells);
    }
    if (!candidates.length) return pickWalkableCell(openCells, { rng });
    let bestScore = -1;
    let best = [];
    for (let i = 0; i < candidates.length; i++) {
        const cell = candidates[i];
        let minThreatDist = Infinity;
        for (let j = 0; j < threats.length; j++) {
            const threatCell = grid.worldToGrid(threats[j].x, threats[j].y);
            minThreatDist = Math.min(minThreatDist, cellChebyshevDistance(cell.col, cell.row, threatCell.col, threatCell.row));
        }
        if (minThreatDist > bestScore) {
            bestScore = minThreatDist;
            best = [cell];
        } else if (minThreatDist === bestScore) best.push(cell);
    }
    return best[Math.floor(rng() * best.length)];
}
export function pickSnakeIntentTarget(seeker, selfHeadId, state, registry, resolveVisibleFood, visionCone) {
    const config = getSnakeGameConfig();
    if (collectVisibleSnakeThreats(state, seeker, selfHeadId, registry, visionCone).length) return { mode: "flee", target: null };
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
