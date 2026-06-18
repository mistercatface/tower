import { getCollisionSettings } from "../../Core/GameCollisionSettings.js";
import { resolveBodyRadius } from "./bodyDefaults.js";
import { isStandTipProp } from "../Spatial/transforms/longAxisBox3d.js";
export function kineticFootprintArea(body) {
    if (body.footprintArea > 0) return body.footprintArea;
    const shape = body.shape ?? body.getShape?.();
    if (shape?.type === "Polygon" && body.halfExtents) return body.halfExtents.x * 2 * body.halfExtents.y * 2;
    if (shape?.type === "Circle") return Math.PI * shape.radius * shape.radius;
    const r = body.radius ?? 0;
    return Math.PI * r * r;
}
export function kineticDensity(body) {
    return body.strategy?.density ?? getCollisionSettings().material.densityDefault;
}
export function kineticMassFromFootprint(body) {
    const minMass = getCollisionSettings().material.minMass;
    return Math.max(minMass, kineticDensity(body) * kineticFootprintArea(body));
}
export function kineticInertiaFromBody(body) {
    const m = body.mass || 1;
    if (isStandTipProp(body) && !body.isFallen) {
        const r = resolveBodyRadius(body);
        const h = body.strategy.rollHeight ?? body.strategy.uprightHeight ?? r * 2.5;
        return m * (r * r * 0.25 + (h * h) / 3);
    }
    if (isStandTipProp(body) && body.isFallen && body.halfExtents) {
        const w = body.halfExtents.x * 2;
        const h = body.halfExtents.y * 2;
        return (m * (w * w + h * h)) / 12;
    }
    const shape = body.shape ?? body.getShape?.();
    if (shape?.type === "Polygon") {
        if (body.strategy?.rollAxis === "long" && body.halfExtents) {
            const crossW = body.halfExtents.y * 2;
            const crossH = body.strategy.rollHeight ?? 3;
            return (m * (crossW * crossW + crossH * crossH)) / 12;
        }
        const w = body.halfExtents ? body.halfExtents.x * 2 : body.radius * 2;
        const h = body.halfExtents ? body.halfExtents.y * 2 : body.radius * 2;
        return (m * (w * w + h * h)) / 12;
    }
    const r = shape?.type === "Circle" ? shape.radius : (body.radius ?? 0);
    return (m * r * r) / 2;
}
export function syncKineticRigidBody(body) {
    if (body.footprintArea > 0) body.mass = kineticMassFromFootprint(body);
    else if (body.strategy?.mass != null) body.mass = body.strategy.mass;
    else body.mass = kineticMassFromFootprint(body);
}
export function momentOfInertiaFromBody(body) {
    return kineticInertiaFromBody(body);
}
export function massFromBody(body, defaultMass = getCollisionSettings().mass.kineticFallback) {
    if (body.mass != null) return body.mass;
    return defaultMass;
}
export function inverseMassFromBody(body, defaultMass = getCollisionSettings().mass.kineticFallback) {
    return 1 / massFromBody(body, defaultMass);
}
