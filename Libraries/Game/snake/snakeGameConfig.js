import { syncKineticRigidBody } from "../../Motion/bodyMass.js";
import { SNAKE_GAME_DEFAULTS, SNAKE_KINETIC_MIN_STRIKE_SPEED } from "../../../Config/games/snake.js";
import { mergePartial } from "../../Config/mergePartial.js";
import { getPropAsset } from "../../Props/PropCatalog.js";
let activeSnakeGameConfig = SNAKE_GAME_DEFAULTS;
export function applySnakeGameConfig(overrides) {
    activeSnakeGameConfig = mergePartial(SNAKE_GAME_DEFAULTS, overrides);
}
export function getSnakeGameConfig() {
    return activeSnakeGameConfig;
}
export function resolveSnakeSpawnSpecs(config = getSnakeGameConfig()) {
    const specs = [];
    for (let i = 0; i < config.snakeCount; i++) specs.push({ segmentCount: config.segmentCount });
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
    return radius + resolveSnakePropRadius(config.goalPropId) + config.eatMargin;
}
export function resolveSnakeStartRadius(config = getSnakeGameConfig()) {
    return config.startRadius;
}
export function resolveSnakeHeadBodyMaxDistance(config = getSnakeGameConfig()) {
    return resolveSnakeSegmentSpacing(config, resolveSnakeStartRadius(config)) * 2;
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
