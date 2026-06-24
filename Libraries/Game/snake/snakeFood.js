import { isSnakeFracturableDeadSegment, SNAKE_SHARD_PROP_ID } from "./snakeSegmentFracture.js";

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
