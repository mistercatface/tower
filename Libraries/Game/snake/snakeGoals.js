import { getSnakeGameConfig } from "./snakeGameConfig.js";
import { queryGridCellVision } from "../../Navigation/perception/gridCellVision.js";
import { visitLiveWorldProps } from "../../../GameState/EntityRegistry.js";
export function collectSnakeGoalProps(state) {
    const goalPropId = getSnakeGameConfig().goalPropId;
    const goals = [];
    visitLiveWorldProps(state.worldProps, (prop) => {
        if (prop.type !== goalPropId) return;
        goals.push(prop);
    });
    return goals;
}
export function findNearestVisibleSnakeGoal(state, seeker, { halfAngle, range } = getSnakeGameConfig().visionCone) {
    const goals = collectSnakeGoalProps(state);
    const { visible } = queryGridCellVision(seeker, goals, { halfAngle, range, obstacleGrid: state.obstacleGrid });
    let nearest = null;
    let bestDist = Infinity;
    for (let i = 0; i < visible.length; i++) {
        const goal = visible[i];
        const dist = Math.hypot(goal.x - seeker.x, goal.y - seeker.y);
        if (dist < bestDist) {
            bestDist = dist;
            nearest = goal;
        }
    }
    return nearest;
}
export function countLiveSnakeGoals(state) {
    return collectSnakeGoalProps(state).length;
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
    return goals[0];
}
