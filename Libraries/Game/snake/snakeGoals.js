import { getSnakeGameConfig } from "./snakeGameConfig.js";
import { hasGridCellLineOfSightCached, isWorldPointInVisionCone, resolveObserverGridVision } from "../../Navigation/perception/gridCellVision.js";
import { visitLiveWorldProps } from "../../../GameState/EntityRegistry.js";
import { removeSandboxWorldProp } from "../../Sandbox/sandboxPlacedSpawn.js";
import { collectAllSnakeGoals, collectSnakeGoalsInRect, countSnakeGoals, getSnakeGoalIndex, unregisterSnakeGoal } from "./snakeGoalIndex.js";
import { ensureSnakePerceptionTick } from "./snakePerception.js";
function collectSnakeGoalPropsFallback(state) {
    const goalPropId = getSnakeGameConfig().goalPropId;
    const goals = [];
    visitLiveWorldProps(state.worldProps, (prop) => {
        if (prop.type !== goalPropId) return;
        goals.push(prop);
    });
    return goals;
}
function collectSnakeGoalCandidates(state, seeker, visionCone, vision) {
    const index = getSnakeGoalIndex(state);
    if (!index) return collectSnakeGoalPropsFallback(state);
    const grid = state.obstacleGrid;
    const rangeCells = Math.ceil(visionCone.range / grid.cellSize);
    const minCol = Math.max(0, vision.originCol - rangeCells);
    const maxCol = Math.min(grid.cols - 1, vision.originCol + rangeCells);
    const minRow = Math.max(0, vision.originRow - rangeCells);
    const maxRow = Math.min(grid.rows - 1, vision.originRow + rangeCells);
    return collectSnakeGoalsInRect(index, state.entityRegistry, minCol, maxCol, minRow, maxRow, grid.cols, grid.rows);
}
export function collectSnakeGoalProps(state) {
    const index = getSnakeGoalIndex(state);
    if (index) return collectAllSnakeGoals(index, state.entityRegistry);
    return collectSnakeGoalPropsFallback(state);
}
export function findNearestVisibleSnakeGoal(state, seeker, visionCone = getSnakeGameConfig().visionCone) {
    ensureSnakePerceptionTick(state);
    const gridNavContext = state.navigation.gridNavContext;
    const visionSession = state.navigation.gridCellVisionSession;
    const onScreen = state.viewport?.circleInBounds?.(seeker.x, seeker.y, (seeker.radius ?? 8) * 2, "props") ?? true;
    const brainSyncOffScreenInterval = getSnakeGameConfig().brainSyncOffScreenInterval;
    const vision = resolveObserverGridVision(seeker, gridNavContext, visionCone, visionSession, { onScreen, brainSyncOffScreenInterval });
    const candidates = collectSnakeGoalCandidates(state, seeker, visionCone, vision);
    const grid = gridNavContext.grid;
    let nearest = null;
    let bestDist = Infinity;
    for (let i = 0; i < candidates.length; i++) {
        const goal = candidates[i];
        if (goal === seeker || goal.isDead) continue;
        if (!isWorldPointInVisionCone(seeker.x, seeker.y, vision.heading, visionCone.halfAngle, visionCone.range, goal.x, goal.y)) continue;
        const { col, row } = grid.worldToGrid(goal.x, goal.y);
        if (!hasGridCellLineOfSightCached(visionSession, gridNavContext, vision.originCol, vision.originRow, col, row)) continue;
        const dist = Math.hypot(goal.x - seeker.x, goal.y - seeker.y);
        if (dist < bestDist) {
            bestDist = dist;
            nearest = goal;
        }
    }
    return nearest;
}
export function countLiveSnakeGoals(state) {
    const index = getSnakeGoalIndex(state);
    if (index) return countSnakeGoals(index);
    return collectSnakeGoalPropsFallback(state).length;
}
export function findNearestSnakeGoal(state, x, y) {
    const goals = collectSnakeGoalProps(state);
    let nearest = null;
    let bestDist = Infinity;
    for (let i = 0; i < goals.length; i++) {
        const goal = goals[i];
        const dist = Math.hypot(goal.x - x, goal.y - y);
        if (dist < bestDist) {
            bestDist = dist;
            nearest = goal;
        }
    }
    return nearest;
}
export function findSnakeGoalProp(state) {
    const goals = collectSnakeGoalProps(state);
    return goals[0] ?? null;
}
export function removeSnakeGoalProp(state, prop) {
    const index = getSnakeGoalIndex(state);
    if (index) unregisterSnakeGoal(index, prop.id);
    removeSandboxWorldProp(state, prop);
}
