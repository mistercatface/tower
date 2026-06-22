import { getSnakeSizeScore } from "../snakeScale.js";
import { getSnakeGameConfig } from "../snakeGameConfig.js";
export function getFleeEffectiveSizeScore(state, headId) {
    const bonus = getSnakeGameConfig().fleeAgent.combatSizeBonus ?? 0;
    return getSnakeSizeScore(state, headId) + bonus;
}
