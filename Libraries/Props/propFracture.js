import { removeWorldPropFromState } from "../../GameState/EntityRegistry.js";
import { transformPoint2DInto, convexFootprintHalfExtents, polygonSignedArea2D } from "../Math/Poly2D.js";
import { syncKineticRigidBody } from "../Motion/bodyMass.js";
import { invalidateBroadphaseBounds } from "../Spatial/collision/entityBroadphase.js";
import { PolygonShape } from "../Spatial/collision/Shapes.js";
import { wakeKineticBody } from "../Motion/kineticSleep.js";
import { bakePoxelOutline, buildGeometryFromPoxelParts, splitPoxels } from "./poxelFracture.js";
import { bakeChunkOutline, buildChunkGeometryAtPropOrigin, buildGeometryFromChunkParts, splitChunks } from "./chunkFracture.js";
import { GLASS_FRACTURE_IMPACT_THRESHOLD, minShardAreaForPolygon, shatterGlassPolygon } from "./glassFracture.js";
export const FRACTURE_MIN_PIECE_SIZE = 5;
export const FRACTURE_IMPACT_THRESHOLD = 12;
function isGlassFracture(prop) {
    return prop?.strategy?.fractureMode === "glass";
}
function isChunkFracture(prop) {
    return prop?.strategy?.fractureMode === "chunk";
}
function glassFootprintArea(prop) {
    if (prop.footprintArea != null) return prop.footprintArea;
    const shape = prop.getShape?.() ?? prop.shape;
    if (shape?.type === "Polygon") return Math.abs(polygonSignedArea2D(shape.vertices));
    return 0;
}
function canGlassFractureSplit(prop, minSize) {
    const shape = prop.getShape?.() ?? prop.shape;
    if (shape?.type !== "Polygon") return false;
    const { x, y } = convexFootprintHalfExtents(shape.vertices);
    if (Math.max(x, y) * 2 < minSize) return false;
    const minArea = minShardAreaForPolygon(shape.vertices) * 2;
    return glassFootprintArea(prop) >= minArea;
}
export function canFracturePropSplit(prop, minSize = FRACTURE_MIN_PIECE_SIZE) {
    if (!prop?.strategy?.fracture) return false;
    if (isGlassFracture(prop)) return canGlassFractureSplit(prop, minSize);
    const shape = prop.getShape?.() ?? prop.shape;
    const { x, y } = shape?.type === "Polygon" ? convexFootprintHalfExtents(shape.vertices) : { x: prop.radius, y: prop.radius };
    if (x * 2 < minSize * 2 || y * 2 < minSize * 2) return false;
    if (isChunkFracture(prop)) return Boolean(prop.chunks && prop.chunks.length > 1);
    return Boolean(prop.poxels && prop.poxels.length > 1);
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
    if (isGlassFracture(prop)) return;
    if (isChunkFracture(prop)) {
        applyChunkGeometryToProp(prop, bakeChunkOutline(flatVertsFromShape(prop)));
        return;
    }
    applyPoxelGeometryToProp(prop, bakePoxelOutline(flatVertsFromShape(prop)));
}
function applyFractureGeometryToProp(prop, geometry) {
    prop.footprintVertices = geometry.footprintVertices;
    prop.footprintArea = geometry.footprintArea;
    prop.radius = geometry.boundingRadius;
    const count = geometry.footprintVertices.length / 2;
    const verts = [];
    for (let i = 0; i < count; i++) verts.push({ x: geometry.footprintVertices[i * 2], y: geometry.footprintVertices[i * 2 + 1] });
    prop.shape = new PolygonShape(verts);
    invalidateBroadphaseBounds(prop);
    syncKineticRigidBody(prop);
}
export function applyPoxelGeometryToProp(prop, geometry) {
    prop.poxels = geometry.poxels;
    prop.chunks = undefined;
    prop.collisionParts = undefined;
    applyFractureGeometryToProp(prop, geometry);
}
export function applyChunkGeometryToProp(prop, geometry) {
    prop.chunks = geometry.chunks;
    prop.poxels = undefined;
    prop.collisionParts = geometry.collisionParts;
    prop.footprintVertices = geometry.footprintVertices;
    prop.footprintArea = geometry.footprintArea;
    prop.radius = geometry.boundingRadius;
    prop.shape = geometry.collisionParts[0];
    invalidateBroadphaseBounds(prop);
    syncKineticRigidBody(prop);
}
export function applyShardGeometryToProp(prop, geometry) {
    prop.poxels = undefined;
    prop.chunks = undefined;
    prop.collisionParts = undefined;
    applyFractureGeometryToProp(prop, geometry);
}
export function splitFootprintIntoComponents(prop, localHitX, localHitY, impactForce, forceExplode = false) {
    if (isChunkFracture(prop)) {
        if (!prop.chunks?.length) return [];
        let components = splitChunks(prop.chunks, localHitX, localHitY, impactForce);
        if (forceExplode && prop.chunks.length > 1) components = prop.chunks.map((chunk) => [chunk]);
        return components.map((comp) => {
            const parts = comp.map((chunk) => ({ vertices: chunk.vertices }));
            return buildGeometryFromChunkParts(parts);
        });
    }
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
export function fractureGlassOnImpact(prop, worldHitX, worldHitY, impactForce) {
    if (!canFracturePropSplit(prop)) return null;
    const local = worldHitToPropLocal(prop, worldHitX, worldHitY);
    const debris = shatterGlassPolygon(flatVertsFromShape(prop), local.x, local.y, impactForce);
    if (debris.length < 2) return null;
    return { debris, originX: prop.x, originY: prop.y, facing: prop.facing, impactLocal: local, impactForce };
}
export function fracturePropOnImpact(prop, worldHitX, worldHitY, impactForce) {
    if (isGlassFracture(prop)) return fractureGlassOnImpact(prop, worldHitX, worldHitY, impactForce);
    if (!canFracturePropSplit(prop)) return null;
    const local = worldHitToPropLocal(prop, worldHitX, worldHitY);
    const originX = prop.x;
    const originY = prop.y;
    if (isChunkFracture(prop)) {
        let components = splitChunks(prop.chunks, local.x, local.y, impactForce);
        if (components.length <= 1) return null;
        components.sort((a, b) => b.length - a.length);
        const largestParts = components[0].map((chunk) => ({ vertices: chunk.vertices }));
        const debris = components.slice(1).map((comp) => buildGeometryFromChunkParts(comp.map((chunk) => ({ vertices: chunk.vertices }))));
        applyChunkGeometryToProp(prop, buildChunkGeometryAtPropOrigin(largestParts));
        return { debris, originX, originY, facing: prop.facing };
    }
    const components = splitFootprintIntoComponents(prop, local.x, local.y, impactForce, false);
    if (components.length <= 1) return null;
    const cos = Math.cos(prop.facing);
    const sin = Math.sin(prop.facing);
    const largest = components[0];
    const debris = components.slice(1);
    const world = transformPoint2DInto({ x: 0, y: 0 }, originX, originY, largest.centroid.cx, largest.centroid.cy, cos, sin);
    prop.x = world.x;
    prop.y = world.y;
    applyPoxelGeometryToProp(prop, largest);
    return { debris, originX, originY, facing: prop.facing };
}
function evictFracturedProp(state, prop, spatialFrame) {
    prop.isDead = true;
    spatialFrame.entityGrid.remove(prop);
    removeWorldPropFromState(state, prop);
}
export function tryFractureKineticContact(state, bodyA, bodyB, hitX, hitY, relativeSpeed, spatialFrame) {
    const force = impactForceFromContact(relativeSpeed, bodyA.mass, bodyB.mass);
    for (let i = 0; i < 2; i++) {
        const prop = i === 0 ? bodyA : bodyB;
        const other = i === 0 ? bodyB : bodyA;
        if (!canFracturePropSplit(prop)) continue;
        if (prop._glassFractureCooldown > 0) continue;
        if (isGlassFracture(prop) && isGlassFracture(other)) continue;
        const threshold = isGlassFracture(prop) ? GLASS_FRACTURE_IMPACT_THRESHOLD : FRACTURE_IMPACT_THRESHOLD;
        if (force < threshold) continue;
        const fracture = fracturePropOnImpact(prop, hitX, hitY, force);
        if (!fracture) continue;
        if (isGlassFracture(prop)) {
            prop.spawnGlassShatter(state, fracture, spatialFrame);
            evictFracturedProp(state, prop, spatialFrame);
        } else {
            wakeKineticBody(prop);
            prop.spawnFractureFragments(state, fracture, spatialFrame);
            spatialFrame.admitKineticProp(prop, state);
        }
        return;
    }
}
