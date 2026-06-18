import { getSnakeGameConfig } from "./snakeGameConfig.js";

export function collectSnakeGoalProps(state) {
    const goalPropId = getSnakeGameConfig().goalPropId;
    const goals = [];
    state.entityRegistry.forEachOfKind("worldProp", (prop) => {
        if (prop.isDead || prop.type !== goalPropId) return;
        goals.push(prop);
    });
    return goals;
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
    return goals[0] ?? null;
}
