import { isSnakeFracturableDeadSegment, SNAKE_SHARD_PROP_ID } from "./snakeSegmentFracture.js";
import { getPropCategoryIndex } from "../../../GameState/SandboxWorldState.js";

export function isSnakeShardFood(prop) {
    return prop?.type === SNAKE_SHARD_PROP_ID;
}

export function isSnakeFoodTarget(prop) {
    return isSnakeShardFood(prop) || isSnakeFracturableDeadSegment(prop);
}

export function canAgentEatSnakeFood(seeker, food) {
    if (!seeker || !food || food.isDead || !isSnakeFoodTarget(food)) return false;
    const seekerFaction = seeker.faction ?? null;
    const foodFaction = food.faction ?? null;
    if (!foodFaction) return true;
    if (!seekerFaction) return true;
    return seekerFaction !== foodFaction;
}

export function isEdibleSnakeFoodForSeeker(seeker, food) {
    return food !== seeker && canAgentEatSnakeFood(seeker, food);
}

export function countLiveSnakeFood(state) {
    const index = getPropCategoryIndex(state, "food");
    let total = 0;
    for (let i = 0; i < index.count.length; i++) total += index.count[i];

    return total;
}

export function findNearestSnakeFood(state, x, y) {
    const index = getPropCategoryIndex(state, "food");
    let nearest = null;
    let bestDistSq = Infinity;
    for (const list of index.buckets.cells.values())
        for (let i = 0; i < list.length; i++) {
            const food = list[i];
            const dx = food.x - x;
            const dy = food.y - y;
            const distSq = dx * dx + dy * dy;
            if (distSq < bestDistSq) {
                bestDistSq = distSq;
                nearest = food;
            }
        }

    return nearest;
}

export function findSnakeFoodProp(state) {
    const index = getPropCategoryIndex(state, "food");
    for (const list of index.buckets.cells.values()) if (list.length > 0) return list[0];

    return null;
}
