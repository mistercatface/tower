import { PolygonShape } from "../Spatial/collision/Shapes.js";
import { invalidateBroadphaseBounds } from "../Spatial/collision/entityBroadphase.js";
import { kineticMassFromFootprint } from "../Motion/bodyMass.js";
import { wakeKineticBody } from "../Motion/kineticSleep.js";
export const FLEE_HORN_WEDGE_REFERENCE_BODY_RADIUS = 4;
export const FLEE_HORN_WEDGE_MOUNT_GAP_RATIO = 0.15;
export const FLEE_HORN_WEDGE_LENGTH_RATIO = 0.7;
export const FLEE_HORN_WEDGE_HALF_WIDTH_RATIO = 0.4;
export const FLEE_HORN_BASE_WORLD_HEIGHT = 2.33;
export function buildFleeHornWedgeFootprint(bodyRadius, wedgeScale = 1) {
    const scaledRadius = bodyRadius * wedgeScale;
    const halfLength = scaledRadius * FLEE_HORN_WEDGE_LENGTH_RATIO * 0.5;
    const halfWidth = scaledRadius * FLEE_HORN_WEDGE_HALF_WIDTH_RATIO;
    return [
        { x: halfLength, y: 0 },
        { x: -halfLength, y: -halfWidth },
        { x: -halfLength, y: halfWidth },
    ];
}
export function fleeHornWedgeWorldHeight(bodyRadius, wedgeScale = 1) {
    const scaledRadius = bodyRadius * wedgeScale;
    return FLEE_HORN_BASE_WORLD_HEIGHT * FLEE_HORN_WEDGE_LENGTH_RATIO * (scaledRadius / FLEE_HORN_WEDGE_REFERENCE_BODY_RADIUS);
}
export function fleeHornMountOffsetFromBallCenter(bodyRadius, wedgeScale = 1) {
    const scaledRadius = bodyRadius * wedgeScale;
    const halfLength = scaledRadius * FLEE_HORN_WEDGE_LENGTH_RATIO * 0.5;
    return bodyRadius + bodyRadius * FLEE_HORN_WEDGE_MOUNT_GAP_RATIO + halfLength;
}
export function applyFleeHornWedgeScale(prop, bodyRadius, wedgeScale = 1) {
    const shapeKey = `${bodyRadius.toFixed(4)}_s${wedgeScale.toFixed(3)}`;
    if (prop._fleeHornBodyRadius === bodyRadius && prop._fleeHornWedgeScale === wedgeScale && prop._fleeHornShapeKey === shapeKey && prop.shape?.type === "Polygon") return;
    const footprint = buildFleeHornWedgeFootprint(bodyRadius, wedgeScale);
    prop.shape = new PolygonShape(footprint);
    prop.radius = prop.shape.getBoundingRadius();
    prop._cachedShape = prop.shape;
    prop._cachedShapeRevision = prop.stateTimer ?? 0;
    if (prop.strategy) prop.strategy.localFootprint = footprint.map((vertex) => ({ x: vertex.x, y: vertex.y }));
    prop.height = fleeHornWedgeWorldHeight(bodyRadius, wedgeScale);
    prop._fleeHornBodyRadius = bodyRadius;
    prop._fleeHornWedgeScale = wedgeScale;
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
    const wedgeScale = prop._fleeHornWedgeScale ?? 1;
    applyFleeHornWedgeScale(prop, bodyRadius, wedgeScale);
    return prop.shape;
}
