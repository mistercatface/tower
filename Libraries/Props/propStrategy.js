import { getDefaultPropQuantizeSteps } from "../../Core/GamePropQuantizeSettings.js";
/** @typedef {"circle" | "box"} PropCollisionShape */
/** Shared defaults for world prop strategies (WorldProp reads these via buildWorldPropStrategy). */
export const PROP_STRATEGY_DEFAULTS = {
    isKinetic: false,
    renderMode: "3d",
    render3DKey: null,
    inspectKey: null,
    friction: 8,
    wallPhysics: null,
    /** @type {PropCollisionShape} */
    collisionShape: "circle",
    rolls: false,
    randomFaceLabels: false,
    gravityImmune: false,
    pinned: false,
};
export function resolvePropQuantizeSteps(prop) {
    const defaults = getDefaultPropQuantizeSteps();
    const override = prop.strategy?.quantizeSteps;
    if (!override) return defaults;
    const facing = override.facing ?? defaults.facing;
    const roll = override.roll ?? override.facing ?? defaults.roll ?? facing;
    return { facing, roll };
}
export function propFootprintHalfExtents(prop) {
    const radius = prop.radius;
    if (prop.halfExtents) return { x: prop.halfExtents.x, y: prop.halfExtents.y };
    return { x: prop.strategy?.halfExtents?.x ?? radius, y: prop.strategy?.halfExtents?.y ?? radius };
}
export function getBaseSpriteCacheKey(prop, deps) {
    const { quantizeAngleIndex, buildRollOrientKey } = deps;
    let orientKey = "";
    if (prop.strategy?.rolls) orientKey = buildRollOrientKey(prop.rollQuat, resolvePropQuantizeSteps(prop).facing);
    else orientKey = `f${quantizeAngleIndex(prop.facing ?? 0, resolvePropQuantizeSteps(prop).facing)}`;
    const radius = Math.round(prop.radius);
    const { x: stratHx, y: stratHy } = propFootprintHalfExtents(prop);
    const halfX = Math.round(stratHx);
    const halfY = Math.round(stratHy);
    let key = `${orientKey}_${radius}_${halfX}x${halfY}`;
    if (prop.sinkDepth != null) key += `_d${Math.round(prop.sinkDepth)}`;
    if (prop.powered === false) key += "_off";
    if (prop._buttonDrawPressed) key += "_on";
    return key;
}
export function getPropStageBakeState(prop, deps) {
    const { quantizeAngle, quantizeRollQuat, anchorX, anchorY } = deps;
    return {
        ...prop,
        x: anchorX,
        y: anchorY,
        radius: prop.radius,
        halfExtents: propFootprintHalfExtents(prop),
        facing: quantizeAngle(prop.facing ?? 0, resolvePropQuantizeSteps(prop).facing),
        rollQuat: prop.strategy?.rolls ? quantizeRollQuat(prop.rollQuat, resolvePropQuantizeSteps(prop).facing) : prop.rollQuat,
    };
}
export function withPropStrategyDefaults(strategy) {
    return { ...PROP_STRATEGY_DEFAULTS, ...strategy };
}
