import { SNAKE_GAME_DEFAULTS } from "../../../Config/games/snake.js";
import { mergePartial } from "../../Config/mergePartial.js";
import { getPropAsset } from "../../Props/PropCatalog.js";
let activeSnakeGameConfig = SNAKE_GAME_DEFAULTS;
export function applySnakeGameConfig(overrides) {
    activeSnakeGameConfig = mergePartial(SNAKE_GAME_DEFAULTS, overrides);
}
export function getSnakeGameConfig() {
    return activeSnakeGameConfig;
}
export function resolveSnakePropRadius(propId) {
    const radius = getPropAsset(propId)?.physics?.radius;
    if (radius == null) throw new Error(`Snake config prop "${propId}" has no physics.radius`);
    return radius;
}
export function resolveSnakeSegmentSpacing(config = getSnakeGameConfig()) {
    return resolveSnakePropRadius(config.segmentPropId) * 2 * config.linkSlack;
}
export function resolveSnakeEatRadius(config = getSnakeGameConfig()) {
    return resolveSnakePropRadius(config.segmentPropId) + resolveSnakePropRadius(config.goalPropId) + config.eatMargin;
}
