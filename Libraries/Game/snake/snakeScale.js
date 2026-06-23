import { getConnectedComponentPath } from "../../Motion/kineticConstraintGraph.js";
import { getCirclePropRadius } from "../../Props/propScale.js";
import { getSnakeGameConfig, resolveSnakeSegmentSpacing } from "./snakeGameConfig.js";
export function getSnakeChainRadius(state, headId) {
    const head = state.entityRegistry.getLive(headId);
    return getCirclePropRadius(head);
}
export function getSnakeSegmentCount(state, headId, members = null) {
    const head = state.entityRegistry.getLive(headId);
    if (head && head._cachedSnakeSegmentCount !== undefined && head._cachedSnakeSegmentCountFrame === state.sandbox.frameId && !members) return head._cachedSnakeSegmentCount;
    const count = (members || getConnectedComponentPath(state.kinetic, headId)).length;
    if (head) {
        head._cachedSnakeSegmentCount = count;
        head._cachedSnakeSegmentCountFrame = state.sandbox?.frameId;
    }
    return count;
}
export function getSnakeSizeScore(state, headId, members = null) {
    const head = state.entityRegistry.getLive(headId);
    if (head && head._cachedSnakeSizeScore !== undefined && head._cachedSnakeSizeScoreFrame === state.sandbox?.frameId && !members) return head._cachedSnakeSizeScore;
    const score = getSnakeSegmentCount(state, headId, members) * 1000 + getSnakeChainRadius(state, headId);
    if (head) {
        head._cachedSnakeSizeScore = score;
        head._cachedSnakeSizeScoreFrame = state.sandbox?.frameId;
    }
    return score;
}
export function growSnakeChainAfterMeal(state, headId, members = null) {
    const config = getSnakeGameConfig();
    const segmentRadius = getSnakeChainRadius(state, headId);
    return { segmentRadius, spacing: resolveSnakeSegmentSpacing(config, segmentRadius), linkSlack: config.agentProfiles.snake.linkSlack };
}
