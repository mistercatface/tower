import { PolygonShape } from "../Spatial/collision/Shapes.js";
import { invalidateBroadphaseBounds } from "../Spatial/collision/entityBroadphase.js";
import { kineticMassFromFootprint } from "../Motion/bodyMass.js";
import { wakeKineticBody } from "../Motion/kineticSleep.js";
export const FLEE_HORN_WEDGE_REFERENCE_BODY_RADIUS = 4;
export const FLEE_HORN_WEDGE_MOUNT_GAP_RATIO = 0.15;
export const FLEE_HORN_WEDGE_LENGTH_RATIO = 0.7;
export const FLEE_HORN_WEDGE_HALF_WIDTH_RATIO = 0.4;
export const FLEE_HORN_BASE_WORLD_HEIGHT = 2.33;
export function buildFleeHornWedgeFootprint(bodyRadius) {
    const halfLength = bodyRadius * FLEE_HORN_WEDGE_LENGTH_RATIO * 0.5;
    const halfWidth = bodyRadius * FLEE_HORN_WEDGE_HALF_WIDTH_RATIO;
    return [
        { x: halfLength, y: 0 },
        { x: -halfLength, y: -halfWidth },
        { x: -halfLength, y: halfWidth },
    ];
}
export function fleeHornWedgeWorldHeight(bodyRadius) {
    return FLEE_HORN_BASE_WORLD_HEIGHT * FLEE_HORN_WEDGE_LENGTH_RATIO * (bodyRadius / FLEE_HORN_WEDGE_REFERENCE_BODY_RADIUS);
}
export function fleeHornMountOffsetFromBallCenter(bodyRadius) {
    const halfLength = bodyRadius * FLEE_HORN_WEDGE_LENGTH_RATIO * 0.5;
    return bodyRadius + bodyRadius * FLEE_HORN_WEDGE_MOUNT_GAP_RATIO + halfLength;
}
export function applyFleeHornWedgeScale(prop, bodyRadius) {
    const shapeKey = bodyRadius.toFixed(4);
    if (prop._fleeHornBodyRadius === bodyRadius && prop._fleeHornShapeKey === shapeKey && prop.shape?.type === "Polygon") return;
    const footprint = buildFleeHornWedgeFootprint(bodyRadius);
    prop.shape = new PolygonShape(footprint);
    prop.radius = prop.shape.getBoundingRadius();
    prop._cachedShape = prop.shape;
    prop._cachedShapeRevision = prop.stateTimer ?? 0;
    if (prop.strategy) prop.strategy.localFootprint = footprint.map((vertex) => ({ x: vertex.x, y: vertex.y }));
    prop.height = fleeHornWedgeWorldHeight(bodyRadius);
    prop._fleeHornBodyRadius = bodyRadius;
    prop._fleeHornShapeKey = shapeKey;
    prop.stateTimer = (prop.stateTimer ?? 0) + 1;
    invalidateBroadphaseBounds(prop);
    if (prop.strategy?.isKinetic) {
        prop.mass = kineticMassFromFootprint(prop);
        wakeKineticBody(prop);
    }
}
export function syncFleeHornWedgeCollisionShape(prop) {
    const bodyRadius = prop._fleeHornBodyRadius ?? FLEE_HORN_WEDGE_REFERENCE_BODY_RADIUS;
    applyFleeHornWedgeScale(prop, bodyRadius);
    return prop.shape;
}
