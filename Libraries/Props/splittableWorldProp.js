import { transformPoint2DInto } from "../Math/Poly2D.js";
import { PolygonShape } from "../Spatial/collision/Shapes.js";
import { invalidateBroadphaseBounds } from "../Spatial/collision/entityBroadphase.js";
import { bakePoxelOutline, buildGeometryFromPoxelParts, localBoxOutline, splitPoxels } from "./poxelFracture.js";
export function initSplittableFootprint(prop) {
    const hx = prop.halfExtents?.x ?? prop.radius;
    const hy = prop.halfExtents?.y ?? prop.radius;
    applyPoxelGeometryToProp(prop, bakePoxelOutline(localBoxOutline(hx, hy)));
}
export function applyPoxelGeometryToProp(prop, geometry) {
    prop.footprintVertices = geometry.footprintVertices;
    prop.poxels = geometry.poxels;
    prop.footprintArea = geometry.footprintArea;
    prop.halfExtents = { x: geometry.halfExtents.x, y: geometry.halfExtents.y };
    prop.radius = geometry.boundingRadius;
    const count = geometry.footprintVertices.length / 2;
    const verts = [];
    for (let i = 0; i < count; i++) verts.push({ x: geometry.footprintVertices[i * 2], y: geometry.footprintVertices[i * 2 + 1] });
    prop.shape = new PolygonShape(verts);
    invalidateBroadphaseBounds(prop);
}
export function splitFootprintIntoComponents(prop, localHitX, localHitY, impactForce, forceExplode = false) {
    if (!prop.poxels?.length) return [];
    let components = splitPoxels(prop.poxels, localHitX, localHitY, impactForce);
    if (forceExplode && prop.poxels.length > 1) components = prop.poxels.map((poxel) => [poxel]);
    return components.map((comp) => {
        const parts = comp.map((poxel) => ({ vertices: poxel.vertices }));
        return buildGeometryFromPoxelParts(parts);
    });
}
export function worldHitToPropLocal(prop, worldX, worldY) {
    const dx = worldX - prop.x;
    const dy = worldY - prop.y;
    const cos = Math.cos(prop.facing);
    const sin = Math.sin(prop.facing);
    return { x: dx * cos + dy * sin, y: -dx * sin + dy * cos };
}
export function impactForceFromContact(relativeSpeed, massA = 1, massB = 1) {
    return relativeSpeed * 0.5 + Math.sqrt(massA * massB) * 0.3;
}
export function fractureSplittableOnImpact(prop, worldHitX, worldHitY, impactForce) {
    if (!prop.poxels?.length || prop.poxels.length <= 1) return null;
    const local = worldHitToPropLocal(prop, worldHitX, worldHitY);
    const components = splitFootprintIntoComponents(prop, local.x, local.y, impactForce, false);
    if (components.length <= 1) return null;
    const originX = prop.x;
    const originY = prop.y;
    const parentArea = prop.footprintArea || 1;
    const parentMass = prop.mass || 1;
    const cos = Math.cos(prop.facing);
    const sin = Math.sin(prop.facing);
    const largest = components[0];
    const debris = components.slice(1);
    const world = transformPoint2DInto({ x: 0, y: 0 }, originX, originY, largest.centroid.cx, largest.centroid.cy, cos, sin);
    prop.x = world.x;
    prop.y = world.y;
    applyPoxelGeometryToProp(prop, largest);
    prop.mass = parentMass * (largest.footprintArea / parentArea);
    return { debris, originX, originY };
}
