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
export function resolveSnakePropRadius(propId) {
    return propCatalog[propId].physics.radius;
}
function randomIntInclusive(min, max, rng) {
    return min + Math.floor(rng() * (max - min + 1));
}
export function resolveSnakeSegmentSpacing(linkSlackOrConfig = getSnakeGameConfig(), segmentRadius = null) {
    if (linkSlackOrConfig && typeof linkSlackOrConfig === "object" && linkSlackOrConfig.agentProfiles) {
        const config = linkSlackOrConfig;
        const snake = config.agentProfiles.snake;
        const radius = segmentRadius ?? resolveSnakePropRadius(snake.bodyPropId);
        return radius * 2 * (snake.linkSlack ?? 1);
    }
    const linkSlack = linkSlackOrConfig;
    const radius = segmentRadius ?? resolveSnakePropRadius(activeSnakeGameConfig.agentProfiles.snake.bodyPropId);
    return radius * 2 * (linkSlack ?? 1);
}
export function resolveSnakeEatRadius(foodPickupRadiusOrConfig = getSnakeGameConfig(), eatMarginOrRadius = null, segmentRadius = null) {
    if (foodPickupRadiusOrConfig && typeof foodPickupRadiusOrConfig === "object" && foodPickupRadiusOrConfig.agentProfiles) {
        const config = foodPickupRadiusOrConfig;
        const radius = eatMarginOrRadius ?? resolveSnakePropRadius(config.agentProfiles.snake.bodyPropId);
        return radius + config.foodPickupRadius + config.eatMargin;
    }
    const foodPickupRadius = foodPickupRadiusOrConfig;
    const eatMargin = eatMarginOrRadius;
    const radius = segmentRadius ?? resolveSnakePropRadius(activeSnakeGameConfig.agentProfiles.snake.bodyPropId);
    return radius + foodPickupRadius + eatMargin;
}
export function resolveSnakeSpawnSpecs(minSegmentsOrConfig = getSnakeGameConfig(), maxSegmentsOrRng = Math.random, populationCount = null, rng = Math.random) {
    if (minSegmentsOrConfig && typeof minSegmentsOrConfig === "object" && minSegmentsOrConfig.agentProfiles) {
        const config = minSegmentsOrConfig;
        const snake = config.agentProfiles.snake;
        const localRng = maxSegmentsOrRng;
        const specs = [];
        const count = snake.populationCount ?? 0;
        for (let i = 0; i < count; i++) {
            const segs = randomIntInclusive(snake.minAliveSegmentCount ?? 3, snake.maxAliveSegmentCount ?? 3, localRng);
            specs.push({ segmentCount: segs });
        }
        return specs;
    }
    const minSegments = minSegmentsOrConfig;
    const maxSegments = maxSegmentsOrRng;
    const count = populationCount ?? 0;
    const specs = [];
    for (let i = 0; i < count; i++) {
        const segs = randomIntInclusive(minSegments ?? 3, maxSegments ?? 3, rng);
        specs.push({ segmentCount: segs });
    }
    return specs;
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
export function resolveSnakeWallDamageConfig(wallDamageConfigOrConfig = getSnakeGameConfig()) {
    if (wallDamageConfigOrConfig && typeof wallDamageConfigOrConfig === "object" && wallDamageConfigOrConfig.agentProfiles) {
        const config = wallDamageConfigOrConfig;
        return { ...config.wallDamage, minStrikeSpeed: SNAKE_KINETIC_MIN_STRIKE_SPEED, referenceMaxSpeed: config.wallDamage.referenceMaxSpeed };
    }
    const wallDamageConfig = wallDamageConfigOrConfig;
    return { ...wallDamageConfig, minStrikeSpeed: SNAKE_KINETIC_MIN_STRIKE_SPEED, referenceMaxSpeed: wallDamageConfig.referenceMaxSpeed };
}
