import { getDefaultPropQuantizeSteps } from "../../Core/GamePropQuantizeSettings.js";
/** @typedef {"circle" | "box"} PropCollisionShape */
/** Shared defaults for world prop strategies (WorldProp reads these via buildWorldPropStrategy). */
export const PROP_STRATEGY_DEFAULTS = {
    isPushable: false,
    renderMode: "3d",
    render3DKey: null,
    inspectKey: null,
    laserTargetable: false,
    mass: 1,
    friction: 8,
    wallPhysics: null,
    canDamageWalls: false,
    wallDamage: 10,
    maxHealth: null,
    /** @type {PropCollisionShape} */
    collisionShape: "circle",
    rolls: false,
    /** @type {"ground" | "long"} ground = sphere; long = log or stand-tip box (barrel) */
    rollAxis: "ground",
    /** Standing props that tip via rollAngle (0 upright → π/2 flat), then tumble like logs. */
    standTip: false,
    rollHeight: null,
    uprightHeight: null,
    tipPushSpeed: 9,
    tipFallAngle: null,
    tipGravity: 16,
    tipDamping: 2.8,
    tipImpulseGain: 0.035,
    actorTipGain: 0.2,
    fallenHalfExtents: null,
    fallenRollHeight: null,
    splittable: false,
    randomFaceLabels: false,
    gravityImmune: false,
};
/**
 * @param {object} prop
 */
export function resolvePropQuantizeSteps(prop) {
    const defaults = getDefaultPropQuantizeSteps();
    const override = prop.strategy?.quantizeSteps;
    if (!override) return defaults;
    const facing = override.facing ?? defaults.facing;
    const roll = override.roll ?? override.facing ?? defaults.roll ?? facing;
    return { facing, roll };
}
/**
 * @param {object} prop
 */
export function propFootprintHalfExtents(prop) {
    const radius = prop.radius;
    if (prop.halfExtents) return { x: prop.halfExtents.x, y: prop.halfExtents.y };
    return { x: prop.strategy?.halfExtents?.x ?? radius, y: prop.strategy?.halfExtents?.y ?? radius };
}
/**
 * @param {object} prop
 * @param {typeof import("../Canvas/viewQuantize.js").quantizeAngleIndex} quantizeAngleIndex
 */
export function buildLongAxisLogOrientKey(prop, quantizeAngleIndex) {
    const { facing, roll } = resolvePropQuantizeSteps(prop);
    return `f${quantizeAngleIndex(prop.facing ?? 0, facing)}_a${quantizeAngleIndex(prop.rollAngle ?? 0, roll)}`;
}
/**
 * @param {object} prop
 * @param {typeof import("../Canvas/viewQuantize.js").quantizeAngle} quantizeAngle
 */
export function quantizeLongAxisAngles(prop, quantizeAngle) {
    const { facing, roll } = resolvePropQuantizeSteps(prop);
    return { facing: quantizeAngle(prop.facing ?? 0, facing), rollAngle: quantizeAngle(prop.rollAngle ?? 0, roll) };
}
/**
 * @param {object} prop
 * @param {object} deps
 */
export function getBaseSpriteCacheKey(prop, deps) {
    const { quantizeAngleIndex, buildRollOrientKey } = deps;
    let orientKey = "";
    if (prop.strategy?.rollAxis === "long") orientKey = buildLongAxisLogOrientKey(prop, quantizeAngleIndex);
    else if (prop.strategy?.rolls) orientKey = buildRollOrientKey(prop.rollQuat, resolvePropQuantizeSteps(prop).facing);
    else orientKey = `f${quantizeAngleIndex(prop.facing ?? 0, resolvePropQuantizeSteps(prop).facing)}`;
    const radius = Math.round(prop.radius);
    const { x: stratHx, y: stratHy } = propFootprintHalfExtents(prop);
    const halfX = Math.round(stratHx);
    const halfY = Math.round(stratHy);
    let key = `${orientKey}_${radius}_${halfX}x${halfY}`;
    if (prop.sinkDepth != null) key += `_d${Math.round(prop.sinkDepth)}`;
    if (prop.powered === false) key += "_off";
    if (prop.wallMode && prop.wallsUp) key += "_walls";
    if (prop._buttonDrawPressed) key += "_on";
    return key;
}
/**
 * @param {object} prop
 * @param {object} deps
 */
export function getPropStageBakeState(prop, deps) {
    const { quantizeAngle, quantizeRollQuat, anchorX, anchorY } = deps;
    const logAngles = prop.strategy?.rollAxis === "long" ? quantizeLongAxisAngles(prop, quantizeAngle) : null;
    return {
        ...prop,
        x: anchorX,
        y: anchorY,
        radius: prop.radius,
        halfExtents: propFootprintHalfExtents(prop),
        facing: logAngles?.facing ?? quantizeAngle(prop.facing ?? 0, resolvePropQuantizeSteps(prop).facing),
        rollAngle: logAngles?.rollAngle ?? prop.rollAngle,
        rollQuat: prop.strategy?.rolls && prop.strategy?.rollAxis !== "long" ? quantizeRollQuat(prop.rollQuat, resolvePropQuantizeSteps(prop).facing) : prop.rollQuat,
    };
}
/**
 * @param {object} strategy
 */
export function withPropStrategyDefaults(strategy) {
    return { ...PROP_STRATEGY_DEFAULTS, ...strategy };
}
