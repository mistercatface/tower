import { transformPoint2DInto, convexFootprintHalfExtents } from "../Math/Poly2D.js";
import { syncKineticRigidBody } from "../Motion/bodyMass.js";
import { invalidateBroadphaseBounds } from "../Spatial/collision/entityBroadphase.js";
import { PolygonShape } from "../Spatial/collision/Shapes.js";
import { wakeKineticBody } from "../Motion/kineticSleep.js";
import { bakePoxelOutline, buildGeometryFromPoxelParts, splitPoxels } from "./poxelFracture.js";

export const FRACTURE_MIN_PIECE_SIZE = 3;
export const FRACTURE_IMPACT_THRESHOLD = 12;

export function canFracturePropSplit(prop, minSize = FRACTURE_MIN_PIECE_SIZE) {
    if (!prop?.strategy?.fracture) return false;
    if (!prop.poxels || prop.poxels.length <= 1) return false;
    const shape = prop.getShape?.() ?? prop.shape;
    const { x, y } = shape?.type === "Polygon" ? convexFootprintHalfExtents(shape.vertices) : { x: prop.radius, y: prop.radius };
    return x * 2 >= minSize * 2 && y * 2 >= minSize * 2;
}

function flatVertsFromShape(prop) {
    const shape = prop.getShape?.() ?? prop.shape;
    const flat = new Float32Array(shape.vertices.length * 2);
    for (let i = 0; i < shape.vertices.length; i++) {
        flat[i * 2] = shape.vertices[i].x;
        flat[i * 2 + 1] = shape.vertices[i].y;
    }
    return flat;
}

export function initFractureFootprint(prop) {
    applyPoxelGeometryToProp(prop, bakePoxelOutline(flatVertsFromShape(prop)));
}

export function applyPoxelGeometryToProp(prop, geometry) {
    prop.footprintVertices = geometry.footprintVertices;
    prop.poxels = geometry.poxels;
    prop.footprintArea = geometry.footprintArea;
    prop.radius = geometry.boundingRadius;
    const count = geometry.footprintVertices.length / 2;
    const verts = [];
    for (let i = 0; i < count; i++) verts.push({ x: geometry.footprintVertices[i * 2], y: geometry.footprintVertices[i * 2 + 1] });
    prop.shape = new PolygonShape(verts);
    invalidateBroadphaseBounds(prop);
    syncKineticRigidBody(prop);
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

export function fracturePropOnImpact(prop, worldHitX, worldHitY, impactForce) {
    if (!canFracturePropSplit(prop)) return null;
    const local = worldHitToPropLocal(prop, worldHitX, worldHitY);
    const components = splitFootprintIntoComponents(prop, local.x, local.y, impactForce, false);
    if (components.length <= 1) return null;
    const originX = prop.x;
    const originY = prop.y;
    const cos = Math.cos(prop.facing);
    const sin = Math.sin(prop.facing);
    const largest = components[0];
    const debris = components.slice(1);
    const world = transformPoint2DInto({ x: 0, y: 0 }, originX, originY, largest.centroid.cx, largest.centroid.cy, cos, sin);
    prop.x = world.x;
    prop.y = world.y;
    applyPoxelGeometryToProp(prop, largest);
    return { debris, originX, originY };
}

export function tryFractureKineticContact(state, bodyA, bodyB, hitX, hitY, relativeSpeed) {
    const force = impactForceFromContact(relativeSpeed, bodyA.mass, bodyB.mass);
    if (force < FRACTURE_IMPACT_THRESHOLD) return;
    for (let i = 0; i < 2; i++) {
        const prop = i === 0 ? bodyA : bodyB;
        if (!canFracturePropSplit(prop)) continue;
        const fracture = fracturePropOnImpact(prop, hitX, hitY, force);
        if (!fracture) continue;
        wakeKineticBody(prop);
        prop.spawnFractureFragments(state, fracture);
        return;
    }
}
