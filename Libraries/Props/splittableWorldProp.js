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
