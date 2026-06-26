import { CircleShape, PolygonShape } from "../Spatial/collision/Shapes.js";
import { invalidateBroadphaseBounds } from "../Spatial/collision/entityBroadphase.js";
import { kineticMassFromFootprint, syncKineticRigidBody } from "../Motion/bodyMass.js";
import { wakeKineticBody } from "../Motion/kineticSleep.js";
export function getPolygonPropBoundingRadius(prop) {
    const shape = prop.shape;
    if (shape?.type === "Polygon") return shape.getBoundingRadius();
    return prop.radius ?? null;
}
export function scalePolygonPropFootprint(prop, scale) {
    if (scale <= 0) throw new Error(`Polygon prop scale must be > 0, got ${scale}`);
    const shape = prop.shape;
    if (shape?.type !== "Polygon") throw new Error(`scalePolygonPropFootprint requires a polygon prop, got ${shape?.type ?? "none"}`);
    const scaled = shape.vertices.map((vertex) => ({ x: vertex.x * scale, y: vertex.y * scale }));
    prop.shape = new PolygonShape(scaled);
    prop.radius = prop.shape.getBoundingRadius();
    if (prop.strategy?.localFootprint?.length >= 3) prop.strategy.localFootprint = scaled.map((vertex) => ({ x: vertex.x, y: vertex.y }));
    if (prop.height != null) prop.height *= scale;
    prop.stateTimer = (prop.stateTimer ?? 0) + 1;
    invalidateBroadphaseBounds(prop);
    if (prop.strategy?.isKinetic) {
        syncKineticRigidBody(prop);
        wakeKineticBody(prop);
    }
}
export function setPolygonPropBoundingRadius(prop, boundingRadius) {
    const currentRadius = getPolygonPropBoundingRadius(prop);
    if (!currentRadius || currentRadius <= 0) throw new Error(`setPolygonPropBoundingRadius requires a polygon prop with positive radius, got ${currentRadius}`);
    scalePolygonPropFootprint(prop, boundingRadius / currentRadius);
}
export function getCirclePropRadius(prop) {
    const shape = prop.shape;
    if (shape?.type === "Circle") return shape.radius;
    return prop.radius ?? null;
}
export function setCirclePropRadius(prop, radius) {
    if (radius <= 0) throw new Error(`Circle prop radius must be > 0, got ${radius}`);
    if (prop.strategy?.syncCollisionShape) {
        prop.strategy.radius = radius;
        prop.strategy.syncCollisionShape(prop);
        prop.stateTimer = (prop.stateTimer ?? 0) + 1;
        invalidateBroadphaseBounds(prop);
        if (prop.strategy?.isKinetic) {
            prop.mass = kineticMassFromFootprint(prop);
            wakeKineticBody(prop);
        }
        return;
    }
    const shape = prop.shape;
    if (shape?.type !== "Circle") throw new Error(`setCirclePropRadius requires a circle prop, got ${shape?.type ?? "none"}`);
    prop.shape = new CircleShape(radius);
    prop.radius = radius;
    if (prop.strategy) prop.strategy.radius = radius;
    invalidateBroadphaseBounds(prop);
    if (prop.strategy?.isKinetic) {
        syncKineticRigidBody(prop);
        wakeKineticBody(prop);
    }
}
