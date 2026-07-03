import { collisionSettings } from "./physicsDefaults.js";
import { polygonSecondMomentAboutCentroid2D, polygonSignedArea2D, polygonCentroid2D } from "../Math/Poly2D.js";
function polygonShapeArea(shape) {
    const verts = shape.vertices;
    if (!verts || verts.length < 6) return 0;
    return Math.abs(polygonSignedArea2D(verts));
}
function polygonShapeInertiaFactor(shape) {
    const verts = shape.vertices;
    if (!verts || verts.length < 6) return 0;
    const area = Math.abs(polygonSignedArea2D(verts));
    if (area < 1e-10) return 0;
    return polygonSecondMomentAboutCentroid2D(verts) / area;
}
function collisionPartMassProperties(shape) {
    if (shape.type === "Circle") {
        const r = shape.radius;
        const area = Math.PI * r * r;
        return { area, cx: 0, cy: 0, inertiaPerArea: (r * r) / 2 };
    }
    const verts = shape.vertices;
    const area = Math.abs(polygonSignedArea2D(verts));
    if (area < 1e-10) return { area: 0, cx: 0, cy: 0, inertiaPerArea: 0 };
    const { cx, cy } = polygonCentroid2D(verts);
    return { area, cx, cy, inertiaPerArea: polygonSecondMomentAboutCentroid2D(verts) / area };
}
function compoundInertiaFactor(parts) {
    if (parts.length === 1) return collisionPartMassProperties(parts[0]).inertiaPerArea;
    let totalArea = 0;
    let cx = 0;
    let cy = 0;
    const partAreas = [];
    const partCentroids = [];
    const partInertiaPerArea = [];
    for (let i = 0; i < parts.length; i++) {
        const { area, cx: px, cy: py, inertiaPerArea } = collisionPartMassProperties(parts[i]);
        partAreas.push(area);
        partCentroids.push({ px, py });
        partInertiaPerArea.push(inertiaPerArea);
        totalArea += area;
        cx += px * area;
        cy += py * area;
    }
    cx /= totalArea;
    cy /= totalArea;
    let inertia = 0;
    for (let i = 0; i < parts.length; i++) {
        const Icm = partInertiaPerArea[i] * partAreas[i];
        const dx = partCentroids[i].px - cx;
        const dy = partCentroids[i].py - cy;
        inertia += Icm + partAreas[i] * (dx * dx + dy * dy);
    }
    return inertia / totalArea;
}
export function kineticFootprintArea(body) {
    if (body.footprintArea != null) return body.footprintArea;
    const parts = body.collisionParts;
    if (parts?.length > 1) {
        let area = 0;
        for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            if (part.type === "Polygon") area += polygonShapeArea(part);
            else if (part.type === "Circle") area += Math.PI * part.radius * part.radius;
        }
        return area;
    }
    const shape = body.shape;
    if (shape?.type === "Polygon") return polygonShapeArea(shape);
    if (shape?.type === "Circle") return Math.PI * shape.radius * shape.radius;
    const r = body.radius ?? 0;
    return Math.PI * r * r;
}
export function kineticDensity(body) {
    return body.strategy?.density ?? collisionSettings.material.densityDefault;
}
export function kineticMassFromFootprint(body) {
    const minMass = collisionSettings.material.minMass;
    return Math.max(minMass, kineticDensity(body) * kineticFootprintArea(body));
}
export function kineticInertiaFromBody(body) {
    const m = massFromBody(body);
    const parts = body.collisionParts;
    if (parts?.length > 1) return m * compoundInertiaFactor(parts);
    const shape = body.shape;
    if (shape?.type === "Polygon") {
        const inertiaFactor = polygonShapeInertiaFactor(shape);
        return m * inertiaFactor;
    }
    const r = shape?.type === "Circle" ? shape.radius : (body.radius ?? 0);
    return (m * r * r) / 2;
}
export function syncKineticRigidBody(body) {
    body.strategy?.syncCollisionShape?.(body);
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
