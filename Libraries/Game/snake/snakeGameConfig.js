import { SNAKE_GAME_DEFAULTS } from "../../../Config/games/snake.js";
import { mergePartial } from "../../Config/mergePartial.js";
import { getPropAsset } from "../../Props/PropCatalog.js";
let activeSnakeGameConfig = SNAKE_GAME_DEFAULTS;
export function applySnakeGameConfig(overrides) {
    activeSnakeGameConfig = mergePartial(SNAKE_GAME_DEFAULTS, overrides);
    if (overrides?.chainColor && typeof overrides.chainColor === "object") {
        activeSnakeGameConfig.chainColor = { ...SNAKE_GAME_DEFAULTS.chainColor, ...overrides.chainColor };
    }
}
export function getSnakeGameConfig() {
    return activeSnakeGameConfig;
}
export function resolveSnakeSpawnSpecs(config = getSnakeGameConfig()) {
    const specs = [];
    const playerIndex = config.playerSnakeIndex ?? 0;
    for (let i = 0; i < config.snakeCount; i++) {
        specs.push({ segmentCount: config.segmentCount, cameraFollow: i === playerIndex });
    }
    return specs;
}
export function resolveSnakeChainColorOptions(config = getSnakeGameConfig()) {
    return config.chainColor;
}
export function resolveSnakePropRadius(propId) {
    const radius = getPropAsset(propId)?.physics?.radius;
    if (radius == null) throw new Error(`Snake config prop "${propId}" has no physics.radius`);
    return radius;
}
export function resolveSnakeSegmentSpacing(config = getSnakeGameConfig(), segmentRadius = null) {
    const radius = segmentRadius ?? resolveSnakePropRadius(config.segmentPropId);
    return radius * 2 * config.linkSlack;
}
export function resolveSnakeEatRadius(config = getSnakeGameConfig(), segmentRadius = null) {
    const radius = segmentRadius ?? resolveSnakePropRadius(config.segmentPropId);
    return radius + resolveSnakePropRadius(config.goalPropId) + config.eatMargin;
}
export function resolveSnakeStartRadius(config = getSnakeGameConfig()) {
    return config.startRadius;
}
