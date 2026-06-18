import { getCollisionSettings } from "../../Core/GameCollisionSettings.js";
import { polygonSecondMomentAboutCentroid2D, polygonSignedArea2D } from "../Math/Poly2D.js";
function polygonShapeArea(shape) {
    const verts = shape.vertices;
    if (!verts || verts.length < 3) return 0;
    return Math.abs(polygonSignedArea2D(verts));
}
function polygonCentroid2D(vertices) {
    let cx = 0;
    let cy = 0;
    let signedArea = 0;
    const count = vertices.length;
    for (let i = 0; i < count; i++) {
        const j = (i + 1) % count;
        const cross = vertices[i].x * vertices[j].y - vertices[j].x * vertices[i].y;
        signedArea += cross;
        cx += (vertices[i].x + vertices[j].x) * cross;
        cy += (vertices[i].y + vertices[j].y) * cross;
    }
    signedArea *= 0.5;
    const inv = 1 / (6 * signedArea);
    return { cx: cx * inv, cy: cy * inv };
}
function polygonShapeInertiaFactor(shape) {
    const verts = shape.vertices;
    if (!verts || verts.length < 3) return 0;
    const area = Math.abs(polygonSignedArea2D(verts));
    if (area < 1e-10) return 0;
    return polygonSecondMomentAboutCentroid2D(verts) / area;
}
function compoundInertiaFactor(parts) {
    if (parts.length === 1) return polygonShapeInertiaFactor(parts[0]);
    let totalArea = 0;
    let cx = 0;
    let cy = 0;
    const partAreas = [];
    const partCentroids = [];
    for (let i = 0; i < parts.length; i++) {
        const verts = parts[i].vertices;
        const area = Math.abs(polygonSignedArea2D(verts));
        const { cx: px, cy: py } = polygonCentroid2D(verts);
        partAreas.push(area);
        partCentroids.push({ px, py });
        totalArea += area;
        cx += px * area;
        cy += py * area;
    }
    cx /= totalArea;
    cy /= totalArea;
    let inertia = 0;
    for (let i = 0; i < parts.length; i++) {
        const verts = parts[i].vertices;
        const Icm = polygonSecondMomentAboutCentroid2D(verts);
        const dx = partCentroids[i].px - cx;
        const dy = partCentroids[i].py - cy;
        inertia += Icm + partAreas[i] * (dx * dx + dy * dy);
    }
    return inertia / totalArea;
}
export function kineticFootprintArea(body) {
    if (body.footprintArea != null) return body.footprintArea;
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
    const parts = body.collisionParts;
    if (parts?.length > 1) return m * compoundInertiaFactor(parts);
    const shape = body.shape ?? body.getShape?.();
    if (shape?.type === "Polygon") {
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
