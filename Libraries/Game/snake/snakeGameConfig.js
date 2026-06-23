import { SNAKE_GAME_DEFAULTS, SNAKE_KINETIC_MIN_STRIKE_SPEED } from "../../../Config/games/snake.js";
import { mergeObjectTree } from "../../Config/mergeConfig.js";
import propCatalog from "../../../Assets/props/index.js";
const LEGACY_SHARED_KEYS = [
    "visionRange",
    "decisionReachHorizon",
    "exploreMinTiles",
    "exploreFallbackMinTiles",
    "spatialMemoryCapacity",
    "navMemoryStepPenalty",
    "navMemoryStepFalloff",
    "intentMemory",
    "terminalHoming",
    "fleeTiles",
    "fleeRange",
    "lethalThreatRange",
    "fleeHysteresis",
];
const LEGACY_SNAKE_PROFILE_KEYS = [
    "segmentPropId",
    "headPropId",
    "linkSlack",
    "headMaxSpeed",
    "headFriction",
    "headAccel",
    "segmentFriction",
    "segmentDensity",
    "segmentCount",
    "growDirX",
    "growDirY",
    "metabolism",
    "rivalBand",
    "hungerBands",
    "decisionWeights",
    "decisionPressure",
    "factionCohesion",
    "sprint",
    "decision",
    "scoringEnv",
    "intent",
    "minAliveSegmentCount",
    "maxAliveSegmentCount",
];
let activeSnakeGameConfig = structuredClone(SNAKE_GAME_DEFAULTS);
function normalizeLegacyConfig(config) {
    if (!config.agentProfiles) return;
    if (!config.shared) config.shared = {};
    if (config.fleeAgent) {
        config.agentProfiles.flee_agent = mergeObjectTree(config.agentProfiles.flee_agent, config.fleeAgent);
        delete config.fleeAgent;
    }
    const sharedPatch = {};
    for (let i = 0; i < LEGACY_SHARED_KEYS.length; i++) {
        const key = LEGACY_SHARED_KEYS[i];
        if (config[key] !== undefined) {
            sharedPatch[key] = config[key];
            delete config[key];
        }
    }
    if (Object.keys(sharedPatch).length > 0) config.shared = mergeObjectTree(config.shared, sharedPatch);
    const snakePatch = {};
    for (let i = 0; i < LEGACY_SNAKE_PROFILE_KEYS.length; i++) {
        const key = LEGACY_SNAKE_PROFILE_KEYS[i];
        if (config[key] !== undefined) {
            if (key === "segmentPropId") snakePatch.bodyPropId = config[key];
            else snakePatch[key] = config[key];
            delete config[key];
        }
    }
    if (Object.keys(snakePatch).length > 0) config.agentProfiles.snake = mergeObjectTree(config.agentProfiles.snake, snakePatch);
    publishConfigCompatAliases(config);
}
function publishConfigCompatAliases(config) {
    const snake = config.agentProfiles?.snake;
    const shared = config.shared ?? {};
    if (snake) {
        config.segmentPropId = snake.bodyPropId;
        config.headPropId = snake.headPropId;
        config.linkSlack = snake.linkSlack;
        config.segmentCount = snake.segmentCount;
        config.growDirX = snake.growDirX;
        config.growDirY = snake.growDirY;
        config.headMaxSpeed = snake.headMaxSpeed;
        config.headFriction = snake.headFriction;
        config.headAccel = snake.headAccel;
        config.segmentFriction = snake.segmentFriction;
        config.segmentDensity = snake.segmentDensity;
        config.minAliveSegmentCount = snake.minAliveSegmentCount;
        config.maxAliveSegmentCount = snake.maxAliveSegmentCount;
        config.metabolism = snake.metabolism;
        config.rivalBand = snake.rivalBand;
    }
    for (let i = 0; i < LEGACY_SHARED_KEYS.length; i++) {
        const key = LEGACY_SHARED_KEYS[i];
        if (shared[key] !== undefined) config[key] = shared[key];
    }
}
export function applySnakeGameConfig(overrides) {
    activeSnakeGameConfig = structuredClone(mergeObjectTree(SNAKE_GAME_DEFAULTS, overrides));
    normalizeLegacyConfig(activeSnakeGameConfig);
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
// Ensure defaults are normalized on module load (compat aliases for tests).
normalizeLegacyConfig(activeSnakeGameConfig);
