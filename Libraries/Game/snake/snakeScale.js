import { getConnectedComponentPath } from "../../Motion/kineticConstraintGraph.js";
import { getCirclePropRadius } from "../../Props/propScale.js";
import { getSnakeGameConfig, resolveSnakeSegmentSpacing } from "./snakeGameConfig.js";
export function getSnakeChainRadius(state, headId) {
    const head = state.entityRegistry.getLive(headId);
    return getCirclePropRadius(head);
}
export function getSnakeSegmentCount(state, headId, members = null) {
    return (members || getConnectedComponentPath(state.kinetic, headId)).length;
}
export function getSnakeSizeScore(state, headId, members = null) {
    return getSnakeSegmentCount(state, headId, members) * 1000 + getSnakeChainRadius(state, headId);
}
export function growSnakeChainAfterMeal(state, headId, members = null) {
    const config = getSnakeGameConfig();
    const segmentRadius = getSnakeChainRadius(state, headId);
    return { segmentRadius, spacing: resolveSnakeSegmentSpacing(config, segmentRadius), linkSlack: config.linkSlack };
}
