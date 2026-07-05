import { propQuantizeSteps } from "./propRenderDefaults.js";
import { initFractureFootprint } from "./fractureSystem.js";
import { boxLocalFootprint, convexFootprintHalfExtents, ensureFlatVerts, vertCount } from "../Math/math.js";
import { syncKineticRigidBody } from "../Physics/physics.js";
import { invalidateBroadphaseBounds } from "../Physics/physics.js";
import { CircleShape, PolygonShape } from "../Physics/physics.js";
import { visualOverrideCacheKey } from "../Color/visualOverride.js";
import { getSurfaceProfileRevision } from "../WorldSurface/SurfaceProfileRevision.js";
/** Shared defaults for world prop strategies (WorldProp reads these via buildWorldPropStrategyFromAsset). */
export const PROP_STRATEGY_DEFAULTS = { isKinetic: false, renderMode: "3d", render3DKey: null, inspectKey: null, friction: 8, wallPhysics: null, rolls: false, pinned: false };
export function applyPropBoxFootprint(prop, hx, hy) {
    prop.shape = new PolygonShape(boxLocalFootprint(hx, hy));
    prop.radius = prop.shape.getBoundingRadius();
    invalidateBroadphaseBounds(prop);
    if (prop.strategy?.fracture && prop.strategy.fracture.mode !== "glass") initFractureFootprint(prop);
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
            if (part.type === "Polygon") return new PolygonShape(part.vertices);
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
    if (footprint && vertCount(footprint) >= 3) {
        prop.shape = new PolygonShape(footprint);
        prop.radius = prop.shape.getBoundingRadius();
        if (prop.strategy.fracture && prop.strategy.fracture.mode !== "glass") initFractureFootprint(prop);
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
        let hash = 2166136261;
        const verts = shape.vertices;
        const count = verts.length;
        for (let i = 0; i < count; i++) {
            const q = Math.round(verts[i]);
            hash ^= q;
            hash = Math.imul(hash, 16777619);
        }
        let key = `p${hash >>> 0}`;
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
    if (strategy.localFootprint) strategy.localFootprint = new Float32Array(ensureFlatVerts(strategy.localFootprint));
    if (strategy.collisionParts)
        strategy.collisionParts = strategy.collisionParts.map((part) => {
            if (part.type === "Polygon" && part.vertices) return { ...part, vertices: new Float32Array(ensureFlatVerts(part.vertices)) };
            return part;
        });
    return withPropStrategyDefaults({ render3DKey: asset.id, renderMode: renderMode ?? "3d", inspectKey: null, ...strategy });
}
export function applyCrossPinwheelFootprint(prop, length, thickness) {
    const halfL = length / 2;
    const halfT = thickness / 2;
    prop.collisionParts = [new PolygonShape(boxLocalFootprint(halfL, halfT)), new PolygonShape(boxLocalFootprint(halfT, halfL))];
    prop.shape = prop.collisionParts[0];
    prop.radius = Math.hypot(halfL, halfT);
    prop.crossLength = length;
    prop.crossThickness = thickness;
    invalidateBroadphaseBounds(prop);
    if (prop.strategy?.isKinetic) syncKineticRigidBody(prop);
}
