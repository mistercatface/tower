import { getDefaultPropQuantizeSteps } from "../../Core/GamePropQuantizeSettings.js";
import { boxLocalFootprint } from "../Math/Poly2D.js";
import { syncKineticRigidBody } from "../Motion/bodyMass.js";
import { invalidateBroadphaseBounds } from "../Spatial/collision/entityBroadphase.js";
import { CircleShape, PolygonShape } from "../Spatial/collision/Shapes.js";
/** Shared defaults for world prop strategies (WorldProp reads these via buildWorldPropStrategy). */
export const PROP_STRATEGY_DEFAULTS = { isKinetic: false, renderMode: "3d", render3DKey: null, inspectKey: null, friction: 8, wallPhysics: null, rolls: false, gravityImmune: false, pinned: false };
export function applyPropBoxFootprint(prop, hx, hy) {
    prop.halfExtents = { x: hx, y: hy };
    prop.shape = new PolygonShape(boxLocalFootprint(hx, hy));
    prop.radius = prop.shape.getBoundingRadius();
    invalidateBroadphaseBounds(prop);
    if (prop.strategy?.isKinetic) syncKineticRigidBody(prop);
}
export function initWorldPropShape(prop) {
    if (typeof prop.strategy.syncCollisionShape === "function") {
        prop.strategy.syncCollisionShape(prop);
        return;
    }
    const footprint = prop.strategy.localFootprint;
    if (footprint?.length >= 3) {
        const verts = footprint.map((v) => ({ x: v.x, y: v.y }));
        prop.shape = new PolygonShape(verts);
        prop.radius = prop.shape.getBoundingRadius();
        return;
    }
    if (prop.strategy.halfExtents) {
        applyPropBoxFootprint(prop, prop.strategy.halfExtents.x, prop.strategy.halfExtents.y);
        return;
    }
    prop.radius = prop.strategy.radius ?? 0;
    prop.shape = new CircleShape(prop.radius);
}
function polygonFootprintHalfExtents(shape) {
    let hx = 0;
    let hy = 0;
    for (const v of shape.vertices) {
        hx = Math.max(hx, Math.abs(v.x));
        hy = Math.max(hy, Math.abs(v.y));
    }
    return { x: hx, y: hy };
}
function propShapeFootprintKey(prop) {
    const shape = prop.shape ?? prop.getShape?.();
    if (shape?.type === "Polygon") return shape.vertices.map((v) => `${Math.round(v.x)},${Math.round(v.y)}`).join("_");
    return `c${Math.round(prop.radius ?? shape?.radius ?? 0)}`;
}
export function resolvePropQuantizeSteps(prop) {
    const defaults = getDefaultPropQuantizeSteps();
    const override = prop.strategy?.quantizeSteps;
    if (!override) return defaults;
    const facing = override.facing ?? defaults.facing;
    const roll = override.roll ?? override.facing ?? defaults.roll ?? facing;
    return { facing, roll };
}
export function propFootprintHalfExtents(prop) {
    if (prop.halfExtents) return { x: prop.halfExtents.x, y: prop.halfExtents.y };
    const shape = prop.shape ?? prop.getShape?.();
    if (shape?.type === "Polygon") return polygonFootprintHalfExtents(shape);
    const radius = prop.radius ?? prop.strategy?.radius ?? 0;
    return { x: radius, y: radius };
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
