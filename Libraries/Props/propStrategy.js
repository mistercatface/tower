import { propQuantizeSteps } from "./propRenderDefaults.js";
import { initFractureFootprint } from "./propFracture.js";
import { boxLocalFootprint, convexFootprintHalfExtents } from "../Math/Poly2D.js";
import { syncKineticRigidBody } from "../Motion/bodyMass.js";
import { invalidateBroadphaseBounds } from "../Spatial/collision/entityBroadphase.js";
import { CircleShape, PolygonShape } from "../Spatial/collision/Shapes.js";
import { visualOverrideCacheKey } from "../Color/visualOverride.js";
import { getSurfaceProfileRevision } from "../WorldSurface/SurfaceProfileRevision.js";
/** Shared defaults for world prop strategies (WorldProp reads these via buildWorldPropStrategyFromAsset). */
export const PROP_STRATEGY_DEFAULTS = { isKinetic: false, renderMode: "3d", render3DKey: null, inspectKey: null, friction: 8, wallPhysics: null, rolls: false, pinned: false };
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
        if (!prop.collisionParts?.length) prop.radius = prop.shape.getBoundingRadius();
        return;
    }
    if (prop.strategy.collisionParts) {
        prop.collisionParts = prop.strategy.collisionParts.map((part) => {
            if (typeof part.getBoundingRadius === "function") return part;
            if (part.type === "Polygon") {
                let flat;
                if (typeof part.vertices[0] === "number") flat = part.vertices instanceof Float32Array ? part.vertices : new Float32Array(part.vertices);
                else {
                    flat = new Float32Array(part.vertices.length * 2);
                    for (let i = 0; i < part.vertices.length; i++) {
                        flat[i * 2] = part.vertices[i].x;
                        flat[i * 2 + 1] = part.vertices[i].y;
                    }
                }
                return new PolygonShape(flat);
            }
            if (part.type === "Circle") return new CircleShape(part.radius);
            throw new Error(`Unknown collision part type: ${part.type}`);
        });
        let maxR = 0;
        for (let i = 0; i < prop.collisionParts.length; i++) maxR = Math.max(maxR, prop.collisionParts[i].getBoundingRadius());
        prop.radius = maxR;
        prop.shape = prop.collisionParts[0];
        return;
    }
    const footprint = prop.strategy.localFootprint;
    if (footprint?.length >= 3) {
        let flat;
        if (typeof footprint[0] === "number") flat = footprint instanceof Float32Array ? footprint : new Float32Array(footprint);
        else {
            flat = new Float32Array(footprint.length * 2);
            for (let i = 0; i < footprint.length; i++) {
                flat[i * 2] = footprint[i].x;
                flat[i * 2 + 1] = footprint[i].y;
            }
        }
        prop.shape = new PolygonShape(flat);
        prop.radius = prop.shape.getBoundingRadius();
        if (prop.strategy.fracture && prop.strategy.fractureMode !== "glass") initFractureFootprint(prop);
        return;
    }
    prop.radius = prop.strategy.radius ?? 0;
    prop.shape = new CircleShape(prop.radius);
}
export function propFootprintHalfExtents(prop) {
    const shape = prop.shape;
    if (shape?.type === "Polygon") return convexFootprintHalfExtents(shape.vertices);
    const radius = shape?.type === "Circle" ? shape.radius : (prop.radius ?? prop.strategy?.radius ?? 0);
    return { x: radius, y: radius };
}
function propShapeFootprintKey(prop) {
    const shape = prop.shape;
    if (shape?.type === "Polygon") {
        const count = shape.vertices.length / 2;
        const parts = [];
        for (let i = 0; i < count; i++) parts.push(`${Math.round(shape.vertices[i * 2])},${Math.round(shape.vertices[i * 2 + 1])}`);
        let key = parts.join("_");
        if (prop.chunks?.length) key += `_ch${prop.chunks.length}`;
        return key;
    }
    const radius = shape?.type === "Circle" ? shape.radius : (prop.radius ?? 0);
    return `c${Math.round(radius * 4)}`;
}
const FACING_STEPS_MAX = 360;
const FACING_STEPS_BASELINE_DIAMETER = 16;
function deriveFacingStepsFromFootprint(prop, baselineSteps) {
    const { x: hx, y: hy } = propFootprintHalfExtents(prop);
    const worldDiameter = Math.max(hx, hy) * 2;
    if (worldDiameter <= FACING_STEPS_BASELINE_DIAMETER) return baselineSteps;
    const scaled = Math.round((baselineSteps * worldDiameter * 6) / FACING_STEPS_BASELINE_DIAMETER);
    return Math.min(FACING_STEPS_MAX, scaled);
}
export function resolvePropQuantizeSteps(prop) {
    const defaults = propQuantizeSteps;
    const override = prop.strategy?.quantizeSteps;
    const derivedFacing = deriveFacingStepsFromFootprint(prop, defaults.facing);
    const facing = override?.facing ?? derivedFacing;
    const view = override?.view ?? defaults.view ?? 30;
    return { facing, view };
}
export function getWallChunkSpriteCacheKey(prop) {
    if (!prop.wallChunkProfileId) return "";
    const profileId = prop.wallChunkProfileId;
    const rev = getSurfaceProfileRevision(profileId);
    const readyBucket = prop._wallChunkTextureReady ? "ready" : "pending";
    return `wallchunk:${profileId}:${prop.wallChunkHeightPx}:${rev}:${readyBucket}`;
}
export function getBaseSpriteCacheKey(prop, deps) {
    const { quantizeAngleIndex, buildRollOrientKey } = deps;
    let orientKey = "";
    if (prop.strategy?.rolls) orientKey = buildRollOrientKey(prop.rollQuat, resolvePropQuantizeSteps(prop).facing);
    else orientKey = `f${quantizeAngleIndex(prop.facing ?? 0, resolvePropQuantizeSteps(prop).facing)}`;
    let key = `${orientKey}_${propShapeFootprintKey(prop)}`;
    if (prop.powered === false) key += "_off";
    if (prop._buttonDrawPressed) key += "_on";
    key += visualOverrideCacheKey(prop);
    return key;
}
export function getPropStageBakeState(prop, deps) {
    const { quantizeAngle, quantizeRollQuat, anchorX, anchorY } = deps;
    const footprint = propFootprintHalfExtents(prop);
    return {
        ...prop,
        x: prop.x,
        y: prop.y,
        radius: prop.radius,
        halfExtents: footprint,
        facing: quantizeAngle(prop.facing ?? 0, resolvePropQuantizeSteps(prop).facing),
        rollQuat: prop.strategy?.rolls ? quantizeRollQuat(prop.rollQuat, resolvePropQuantizeSteps(prop).facing) : prop.rollQuat,
    };
}
export function withPropStrategyDefaults(strategy) {
    return { ...PROP_STRATEGY_DEFAULTS, ...strategy };
}
export function buildWorldPropStrategyFromAsset(asset) {
    if (!asset?.physics) return withPropStrategyDefaults({});
    const { spawn, renderMode, ...strategy } = asset.physics;
    return withPropStrategyDefaults({ render3DKey: asset.id, renderMode: renderMode ?? "3d", inspectKey: null, ...strategy });
}
export function applyCrossPinwheelFootprint(prop, length, thickness) {
    const halfL = length / 2;
    const halfT = thickness / 2;
    prop.collisionParts = [
        new PolygonShape(new Float32Array([-halfL, -halfT, halfL, -halfT, halfL, halfT, -halfL, halfT])),
        new PolygonShape(new Float32Array([-halfT, -halfL, halfT, -halfL, halfT, halfL, -halfT, halfL])),
    ];
    prop.shape = prop.collisionParts[0];
    prop.radius = Math.hypot(halfL, halfT);
    prop.crossLength = length;
    prop.crossThickness = thickness;
    invalidateBroadphaseBounds(prop);
    if (prop.strategy?.isKinetic) syncKineticRigidBody(prop);
}
