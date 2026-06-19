import { resyncChainLinkRestLengths } from "../../Sandbox/chainLinks.js";
import { getConnectedBodyIds, getConnectedComponentPath } from "../../Motion/kineticConstraintGraph.js";
import { getCirclePropRadius, setCirclePropRadius } from "../../Props/propScale.js";
import { getSnakeGameConfig, resolveSnakeSegmentSpacing } from "./snakeGameConfig.js";
export function getSnakeChainRadius(state, headId) {
    const head = state.entityRegistry.getLive(headId);
    return getCirclePropRadius(head);
}
export function getSnakeSegmentCount(state, headId) {
    return getConnectedComponentPath(state.sandbox, headId).length;
}
export function getSnakeSizeScore(state, headId) {
    return getSnakeSegmentCount(state, headId) * 1000 + getSnakeChainRadius(state, headId);
}
export function stepSnakeChainRadius(state, headId) {
    const config = getSnakeGameConfig();
    const memberIds = getConnectedBodyIds(state.sandbox, headId);
    const current = getSnakeChainRadius(state, headId);
    const next = Math.min(current + config.radiusPerMeal, config.maxRadius);
    if (next !== current) {
        for (let i = 0; i < memberIds.length; i++) {
            const prop = state.entityRegistry.getLive(memberIds[i]);
            setCirclePropRadius(prop, next);
        }
        resyncChainLinkRestLengths(state, memberIds, config.linkSlack);
    }
    return next;
}
export function growSnakeChainAfterMeal(state, headId) {
    const config = getSnakeGameConfig();
    const segmentRadius = stepSnakeChainRadius(state, headId);
    return { segmentRadius, spacing: resolveSnakeSegmentSpacing(config, segmentRadius), linkSlack: config.linkSlack };
}
export function stepSnakeChainRadiusDown(state, headId) {
    const config = getSnakeGameConfig();
    const memberIds = getConnectedBodyIds(state.sandbox, headId);
    const current = getSnakeChainRadius(state, headId);
    const next = Math.max(current - config.radiusPerMeal, config.startRadius);
    if (next !== current) {
        for (let i = 0; i < memberIds.length; i++) {
            const prop = state.entityRegistry.getLive(memberIds[i]);
            setCirclePropRadius(prop, next);
        }
        resyncChainLinkRestLengths(state, memberIds, config.linkSlack);
    }
    return next;
}
