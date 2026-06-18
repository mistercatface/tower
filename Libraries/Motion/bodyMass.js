import { getCollisionSettings } from "../../Core/GameCollisionSettings.js";
import { polygonSecondMomentAboutCentroid2D, polygonSignedArea2D } from "../Math/Poly2D.js";
import { resolveBodyRadius } from "./bodyDefaults.js";
import { isStandTipProp } from "../Spatial/transforms/longAxisBox3d.js";
function polygonShapeArea(shape) {
    const verts = shape.vertices;
    if (!verts || verts.length < 3) return 0;
    return Math.abs(polygonSignedArea2D(verts));
}
function polygonShapeInertiaFactor(shape) {
    const verts = shape.vertices;
    if (!verts || verts.length < 3) return 0;
    const area = Math.abs(polygonSignedArea2D(verts));
    if (area < 1e-10) return 0;
    return polygonSecondMomentAboutCentroid2D(verts) / area;
}
export function kineticFootprintArea(body) {
    if (body.footprintArea > 0) return body.footprintArea;
    const shape = body.shape ?? body.getShape?.();
    if (shape?.type === "Polygon") return polygonShapeArea(shape);
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
    const m = massFromBody(body);
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
        const inertiaFactor = polygonShapeInertiaFactor(shape);
        return m * inertiaFactor;
    }
    const r = shape?.type === "Circle" ? shape.radius : (body.radius ?? 0);
    return (m * r * r) / 2;
}
export function syncKineticRigidBody(body) {
    body.getShape?.();
    body.mass = kineticMassFromFootprint(body);
}
export function massFromBody(body) {
    if (body.mass == null) throw new Error("Kinetic body missing mass — call syncKineticRigidBody first");
    return body.mass;
}
export function inverseMassFromBody(body) {
    if (body.strategy?.pinned) return 0;
    return 1 / massFromBody(body);
}
export function momentOfInertiaFromBody(body) {
    return kineticInertiaFromBody(body);
}
export function bodyPinnedForContact(body) {
    return Boolean(body.strategy?.pinned);
}
