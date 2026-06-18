import { CircleShape } from "../Spatial/collision/Shapes.js";
import { invalidateBroadphaseBounds } from "../Spatial/collision/entityBroadphase.js";
import { syncKineticRigidBody } from "../Motion/bodyMass.js";
import { wakeKineticBody } from "../Motion/kineticSleep.js";
export function getCirclePropRadius(prop) {
    const shape = prop.getShape?.() ?? prop.shape;
    if (shape?.type === "Circle") return shape.radius;
    return prop.radius ?? null;
}
export function setCirclePropRadius(prop, radius) {
    if (radius <= 0) throw new Error(`Circle prop radius must be > 0, got ${radius}`);
    const shape = prop.getShape?.() ?? prop.shape;
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
