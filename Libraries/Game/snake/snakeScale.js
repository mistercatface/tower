import { getChainMemberIds, resyncChainLinkRestLengths } from "../../Sandbox/chainLinks.js";
import { getCirclePropRadius, setCirclePropRadius } from "../../Props/propScale.js";
import { getSnakeGameConfig, resolveSnakeSegmentSpacing } from "./snakeGameConfig.js";
export function getSnakeChainRadius(state, headId) {
    const head = state.entityRegistry.getLive(headId);
    return getCirclePropRadius(head) ?? getSnakeGameConfig().startRadius;
}
export function stepSnakeChainRadius(state, headId) {
    const config = getSnakeGameConfig();
    const memberIds = getChainMemberIds(state, headId);
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
