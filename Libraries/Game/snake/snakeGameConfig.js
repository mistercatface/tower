import { SNAKE_GAME_DEFAULTS, SNAKE_KINETIC_MIN_STRIKE_SPEED } from "../../../Config/games/snake.js";
import { mergeObjectTree } from "../../Config/mergeConfig.js";
import propCatalog from "../../../Assets/props/index.js";
let activeSnakeGameConfig = structuredClone(SNAKE_GAME_DEFAULTS);
export function applySnakeGameConfig(overrides) {
    activeSnakeGameConfig = structuredClone(mergeObjectTree(SNAKE_GAME_DEFAULTS, overrides));
}
export function getSnakeGameConfig() {
    return activeSnakeGameConfig;
}
export function getSharedConfig(config = getSnakeGameConfig()) {
    return config.shared ?? {};
}
export function getThreatConfig(config = getSnakeGameConfig()) {
    const shared = getSharedConfig(config);
    return { ...shared, visionRange: shared.visionRange };
}
export function resolveSnakeBodyConfig(config = getSnakeGameConfig()) {
    const snake = config.agentProfiles.snake;
    return {
        bodyPropId: snake.bodyPropId,
        headPropId: snake.headPropId,
        linkSlack: snake.linkSlack,
        segmentCount: snake.segmentCount,
        growDirX: snake.growDirX,
        growDirY: snake.growDirY,
        minAliveSegmentCount: snake.minAliveSegmentCount,
        maxAliveSegmentCount: snake.maxAliveSegmentCount,
        metabolism: snake.metabolism,
    };
}
export function resolveSnakeChainSpawnOptions(config = getSnakeGameConfig(), segmentCount = null) {
    const snake = config.agentProfiles.snake;
    const count = segmentCount ?? snake.segmentCount;
    return {
        segmentCount: count,
        spacing: resolveSnakeSegmentSpacing(config, config.startRadius),
        segmentRadius: config.startRadius,
        linkSlack: snake.linkSlack,
        ballType: snake.bodyPropId,
        headBallType: snake.headPropId,
        growDirX: snake.growDirX,
        growDirY: snake.growDirY,
    };
}
function randomIntInclusive(min, max, rng) {
    return min + Math.floor(rng() * (max - min + 1));
}
export function resolveSnakeSpawnSpecs(config = getSnakeGameConfig(), rng = Math.random) {
    const snake = config.agentProfiles.snake;
    const min = Math.max(1, Math.round(snake.minAliveSegmentCount ?? 3));
    const max = Math.max(min, Math.round(snake.maxAliveSegmentCount ?? 12));
    const specs = [];
    for (let i = 0; i < config.snakeCount; i++) specs.push({ segmentCount: randomIntInclusive(min, max, rng) });
    return specs;
}
export function resolveSnakePropRadius(propId) {
    return propCatalog[propId].physics.radius;
}
export function resolveSnakeSegmentSpacing(config = getSnakeGameConfig(), segmentRadius = null) {
    const snake = config.agentProfiles.snake;
    const radius = segmentRadius ?? resolveSnakePropRadius(snake.bodyPropId);
    return radius * 2 * (snake.linkSlack ?? 1);
}
export function resolveSnakeEatRadius(config = getSnakeGameConfig(), segmentRadius = null) {
    const snake = config.agentProfiles.snake;
    const radius = segmentRadius ?? resolveSnakePropRadius(snake.bodyPropId);
    return radius + config.foodPickupRadius + config.eatMargin;
}
export function resolveSnakeStartRadius(config = getSnakeGameConfig()) {
    return config.startRadius;
}
export function resolveSnakeWallDamageConfig(config = getSnakeGameConfig()) {
    return { ...config.wallDamage, minStrikeSpeed: SNAKE_KINETIC_MIN_STRIKE_SPEED, referenceMaxSpeed: config.wallDamage.referenceMaxSpeed };
}
