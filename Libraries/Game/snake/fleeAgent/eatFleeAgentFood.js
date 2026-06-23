import { removeSandboxWorldProp } from "../../../Sandbox/sandboxPlacedSpawn.js";
import { getCirclePropRadius } from "../../../Props/propScale.js";
import { canAgentEatSnakeFood, isSnakeShardFood } from "../snakeFood.js";
import { getSnakeGameConfig, resolveSnakeEatRadius } from "../snakeGameConfig.js";
import { feedFleeMetabolism } from "./fleeMetabolism.js";
export function resolveFleeAgentEatRadius(head) {
    const config = getSnakeGameConfig();
    return resolveSnakeEatRadius(config, getCirclePropRadius(head));
}
export function eatFleeAgentFoodShard(state, head, food, metabolism, brain, intent = null) {
    if (!canAgentEatSnakeFood(head, food) || !isSnakeShardFood(food)) return false;
    const eatRadius = resolveFleeAgentEatRadius(head);
    if (Math.hypot(food.x - head.x, food.y - head.y) > eatRadius) return false;
    const config = getSnakeGameConfig();
    const grid = state.obstacleGrid;
    const foodCell = grid.worldToGrid(food.x, food.y);
    brain.stampArrival(foodCell.col, foodCell.row);
    if (intent?.clearTrackedGoal) intent.clearTrackedGoal();
    else if (intent?.headNav) intent.headNav.clearDestination(head);
    removeSandboxWorldProp(state, food);
    feedFleeMetabolism(metabolism, food.snakeFoodValue ?? config.fleeAgent.metabolism.foodValue);
    return true;
}
