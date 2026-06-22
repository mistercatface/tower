import { syncKineticRigidBody } from "../../Motion/bodyMass.js";
import { SNAKE_GAME_DEFAULTS, SNAKE_KINETIC_MIN_STRIKE_SPEED } from "../../../Config/games/snake.js";
import { mergePartial } from "../../Config/mergePartial.js";
import { getPropAsset } from "../../Props/PropCatalog.js";
let activeSnakeGameConfig = SNAKE_GAME_DEFAULTS;
function mergeDecisionPressure(overrides) {
    if (!overrides) return SNAKE_GAME_DEFAULTS.decisionPressure;
    const base = SNAKE_GAME_DEFAULTS.decisionPressure;
    const merged = { ...base, ...overrides };
    if (overrides.riskTolerance) merged.riskTolerance = { ...base.riskTolerance, ...overrides.riskTolerance };
    if (overrides.effort) {
        merged.effort = { ...base.effort, ...overrides.effort };
        if (overrides.effort.costPerCell) merged.effort.costPerCell = { ...base.effort.costPerCell, ...overrides.effort.costPerCell };
        if (overrides.effort.preyValue) merged.effort.preyValue = { ...base.effort.preyValue, ...overrides.effort.preyValue };
    }
    return merged;
}
export function applySnakeGameConfig(overrides) {
    activeSnakeGameConfig = mergePartial(SNAKE_GAME_DEFAULTS, overrides);
    activeSnakeGameConfig.decisionPressure = mergeDecisionPressure(overrides?.decisionPressure);
    if (overrides?.fleeAgent) activeSnakeGameConfig.fleeAgent = { ...SNAKE_GAME_DEFAULTS.fleeAgent, ...overrides.fleeAgent };
    if (overrides?.hornSatellite) activeSnakeGameConfig.hornSatellite = { ...SNAKE_GAME_DEFAULTS.hornSatellite, ...overrides.hornSatellite };
}
export function getSnakeGameConfig() {
    return activeSnakeGameConfig;
}
function randomIntInclusive(min, max, rng) {
    return min + Math.floor(rng() * (max - min + 1));
}
export function resolveSnakeSpawnSpecs(config = getSnakeGameConfig(), rng = Math.random) {
    const specs = [];
    const min = Math.max(1, Math.round(config.minAliveSegmentCount));
    const max = Math.max(min, Math.round(config.maxAliveSegmentCount));
    for (let i = 0; i < config.snakeCount; i++) specs.push({ segmentCount: randomIntInclusive(min, max, rng) });
    return specs;
}
export function resolveSnakePropRadius(propId) {
    return getPropAsset(propId).physics.radius;
}
export function resolveSnakeSegmentSpacing(config = getSnakeGameConfig(), segmentRadius = null) {
    const radius = segmentRadius ?? resolveSnakePropRadius(config.segmentPropId);
    return radius * 2 * config.linkSlack;
}
export function resolveSnakeEatRadius(config = getSnakeGameConfig(), segmentRadius = null) {
    const radius = segmentRadius ?? resolveSnakePropRadius(config.segmentPropId);
    return radius + config.foodPickupRadius + config.eatMargin;
}
export function resolveSnakeStartRadius(config = getSnakeGameConfig()) {
    return config.startRadius;
}
/** Runtime wall-damage tuning for snake mode (shared kinetic floor + striker speed ceiling). */
export function resolveSnakeWallDamageConfig(config = getSnakeGameConfig()) {
    const strikerMax = getPropAsset(config.strikerPropId)?.sandbox?.dragLaunch?.maxPower ?? 560;
    return { ...config.wallDamage, minStrikeSpeed: SNAKE_KINETIC_MIN_STRIKE_SPEED, referenceMaxSpeed: strikerMax };
}
export function applySnakeHeadGameplay(head) {
    const config = getSnakeGameConfig();
    head._brainSyncPass = 0;
    const headMaxSpeed = config.headMaxSpeed;
    if (headMaxSpeed != null) head.strategy.groundNav = { ...head.strategy.groundNav, maxSpeed: headMaxSpeed };
    if (config.headAccel != null) head.strategy.groundNav = { ...head.strategy.groundNav, accel: config.headAccel };
    if (config.headFriction != null) head.strategy.friction = config.headFriction;
}
export function applySnakeSegmentGameplay(segment) {
    const config = getSnakeGameConfig();
    if (config.segmentFriction != null) segment.strategy.friction = config.segmentFriction;
    if (config.segmentDensity != null) {
        segment.strategy.density = config.segmentDensity;
        if (segment.strategy.isKinetic) syncKineticRigidBody(segment);
    }
}
export function applyFleeAgentGameplay(head) {
    const flee = getSnakeGameConfig().fleeAgent;
    if (flee.maxSpeed != null) head.strategy.groundNav = { ...head.strategy.groundNav, maxSpeed: flee.maxSpeed };
    if (flee.accel != null) head.strategy.groundNav = { ...head.strategy.groundNav, accel: flee.accel };
    if (flee.friction != null) head.strategy.friction = flee.friction;
}
export function applyHornSatelliteGameplay(horn) {
    const hornConfig = getSnakeGameConfig().hornSatellite;
    if (hornConfig.maxSpeed != null) horn.strategy.groundNav = { ...horn.strategy.groundNav, maxSpeed: hornConfig.maxSpeed };
    if (hornConfig.accel != null) horn.strategy.groundNav = { ...horn.strategy.groundNav, accel: hornConfig.accel };
    if (hornConfig.friction != null) horn.strategy.friction = hornConfig.friction;
}
