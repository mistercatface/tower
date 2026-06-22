import { removeSandboxWorldProp } from "../../../Sandbox/sandboxPlacedSpawn.js";
import { getCirclePropRadius } from "../../../Props/propScale.js";
import { findNearestSnakeFood, isSnakeShardFood } from "../snakeFood.js";
import { getSnakeGameConfig, resolveSnakeEatRadius } from "../snakeGameConfig.js";
import { feedFleeMetabolism } from "./fleeMetabolism.js";
export function resolveFleeAgentEatRadius(head) {
    const config = getSnakeGameConfig();
    return resolveSnakeEatRadius(config, getCirclePropRadius(head));
}
export function tryEatFleeAgentFood(state, head, metabolism, brain) {
    const food = findNearestSnakeFood(state, head.x, head.y);
    if (!food || !isSnakeShardFood(food)) return false;
    const eatRadius = resolveFleeAgentEatRadius(head);
    if (Math.hypot(food.x - head.x, food.y - head.y) > eatRadius) return false;
    const config = getSnakeGameConfig();
    const grid = state.obstacleGrid;
    const foodCell = grid.worldToGrid(food.x, food.y);
    brain.stampArrival(foodCell.col, foodCell.row);
    removeSandboxWorldProp(state, food);
    feedFleeMetabolism(metabolism, food.snakeFoodValue ?? config.fleeAgent.metabolism.foodValue);
    return true;
}
