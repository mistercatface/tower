import { getDefaultPropQuantizeSteps } from "../../Core/GamePropQuantizeSettings.js";
import { initFractureFootprint } from "./propFracture.js";
import { boxLocalFootprint, convexFootprintHalfExtents } from "../Math/Poly2D.js";
import { syncKineticRigidBody } from "../Motion/bodyMass.js";
import { invalidateBroadphaseBounds } from "../Spatial/collision/entityBroadphase.js";
import { CircleShape, PolygonShape } from "../Spatial/collision/Shapes.js";
/** Shared defaults for world prop strategies (WorldProp reads these via buildWorldPropStrategy). */
export const PROP_STRATEGY_DEFAULTS = { isKinetic: false, renderMode: "3d", render3DKey: null, inspectKey: null, friction: 8, wallPhysics: null, rolls: false, gravityImmune: false, pinned: false };
export function applyPropBoxFootprint(prop, hx, hy) {
    prop.shape = new PolygonShape(boxLocalFootprint(hx, hy));
    prop.radius = prop.shape.getBoundingRadius();
    invalidateBroadphaseBounds(prop);
    if (prop.strategy?.fracture && prop.strategy.fractureMode !== "glass") initFractureFootprint(prop);
    else if (prop.strategy?.isKinetic) syncKineticRigidBody(prop);
}
export function initWorldPropShape(prop) {
    if (typeof prop.strategy.syncCollisionShape === "function") {
        prop.strategy.syncCollisionShape(prop);
        prop.radius = prop.shape.getBoundingRadius();
        return;
    }
    const footprint = prop.strategy.localFootprint;
    if (footprint?.length >= 3) {
        const verts = footprint.map((v) => ({ x: v.x, y: v.y }));
        prop.shape = new PolygonShape(verts);
        prop.radius = prop.shape.getBoundingRadius();
        if (prop.strategy.fracture && prop.strategy.fractureMode !== "glass") initFractureFootprint(prop);
        return;
    }
    prop.radius = prop.strategy.radius ?? 0;
    prop.shape = new CircleShape(prop.radius);
}
export function propFootprintHalfExtents(prop) {
    const shape = prop.getShape?.() ?? prop.shape;
    if (shape?.type === "Polygon") return convexFootprintHalfExtents(shape.vertices);
    const radius = shape?.type === "Circle" ? shape.radius : (prop.radius ?? prop.strategy?.radius ?? 0);
    return { x: radius, y: radius };
}
function propShapeFootprintKey(prop) {
    const shape = prop.getShape?.() ?? prop.shape;
    if (shape?.type === "Polygon") {
        let key = shape.vertices.map((v) => `${Math.round(v.x)},${Math.round(v.y)}`).join("_");
        if (prop.chunks?.length) key += `_ch${prop.chunks.length}`;
        return key;
    }
    const radius = shape?.type === "Circle" ? shape.radius : (prop.radius ?? 0);
    return `c${Math.round(radius)}`;
}
const FACING_STEPS_MAX = 128;
const FACING_STEPS_BASELINE_DIAMETER = 16;
function deriveFacingStepsFromFootprint(prop, baselineSteps) {
    const { x: hx, y: hy } = propFootprintHalfExtents(prop);
    const worldDiameter = Math.max(hx, hy) * 2;
    if (worldDiameter <= FACING_STEPS_BASELINE_DIAMETER) return baselineSteps;
    const scaled = Math.round((baselineSteps * worldDiameter) / FACING_STEPS_BASELINE_DIAMETER);
    return Math.min(FACING_STEPS_MAX, scaled);
}
export function resolvePropQuantizeSteps(prop) {
    const defaults = getDefaultPropQuantizeSteps();
    const override = prop.strategy?.quantizeSteps;
    const derivedFacing = deriveFacingStepsFromFootprint(prop, defaults.facing);
    const facing = override?.facing ?? derivedFacing;
    return { facing };
}
export function getBaseSpriteCacheKey(prop, deps) {
    const { quantizeAngleIndex, buildRollOrientKey } = deps;
    let orientKey = "";
    if (prop.strategy?.rolls) orientKey = buildRollOrientKey(prop.rollQuat, resolvePropQuantizeSteps(prop).facing);
    else orientKey = `f${quantizeAngleIndex(prop.facing ?? 0, resolvePropQuantizeSteps(prop).facing)}`;
    let key = `${orientKey}_${propShapeFootprintKey(prop)}`;
    if (prop.sinkDepth != null) key += `_d${Math.round(prop.sinkDepth)}`;
    if (prop.powered === false) key += "_off";
    if (prop._buttonDrawPressed) key += "_on";
    return key;
}
export function getPropStageBakeState(prop, deps) {
    const { quantizeAngle, quantizeRollQuat, anchorX, anchorY } = deps;
    const footprint = propFootprintHalfExtents(prop);
    return {
        ...prop,
        x: anchorX,
        y: anchorY,
        radius: prop.radius,
        halfExtents: footprint,
        facing: quantizeAngle(prop.facing ?? 0, resolvePropQuantizeSteps(prop).facing),
        rollQuat: prop.strategy?.rolls ? quantizeRollQuat(prop.rollQuat, resolvePropQuantizeSteps(prop).facing) : prop.rollQuat,
    };
}
export function withPropStrategyDefaults(strategy) {
    return { ...PROP_STRATEGY_DEFAULTS, ...strategy };
}
