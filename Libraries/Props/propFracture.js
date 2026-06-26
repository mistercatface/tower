import { addWorldPropToState, removeWorldPropFromState, addWorldPropsToState } from "../../GameState/EntityRegistry.js";
import { WorldProp } from "../../Entities/WorldProp.js";
import { transformPoint2DInto, convexFootprintHalfExtents, polygonSignedArea2D } from "../Math/Poly2D.js";
import { syncKineticRigidBody } from "../Motion/bodyMass.js";
import { invalidateBroadphaseBounds } from "../Spatial/collision/entityBroadphase.js";
import { kineticDynamicSlab } from "../Spatial/collision/kineticBodySlab.js";
import { PolygonShape } from "../Spatial/collision/Shapes.js";
import { wakeKineticBody } from "../Motion/kineticSleep.js";
import { splitPoxels } from "./poxelFracture.js";
import { bakeChunkOutline, buildChunkGeometryAtPropOrigin, buildGeometryFromChunkParts } from "./chunkFracture.js";
import { buildShardGeometry, GLASS_FRACTURE_COOLDOWN_STEPS, GLASS_FRACTURE_IMPACT_THRESHOLD, minShardAreaForPolygon, shatterGlassPolygon } from "./glassFracture.js";
import { acquireWorldProp } from "./worldPropPool.js";
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
    const shape = prop.shape;
    if (shape?.type === "Polygon") return Math.abs(polygonSignedArea2D(shape.vertices));
    return 0;
}
function canGlassFractureSplit(prop, minSize) {
    const shape = prop.shape;
    if (shape?.type !== "Polygon") return false;
    const { x, y } = convexFootprintHalfExtents(shape.vertices);
    if (Math.max(x, y) * 2 < minSize) return false;
    const minArea = minShardAreaForPolygon(shape.vertices) * 2;
    return glassFootprintArea(prop) >= minArea;
}
export function canFracturePropSplit(prop, minSize = FRACTURE_MIN_PIECE_SIZE) {
    if (!prop?.strategy?.fracture) return false;
    if (isGlassFracture(prop)) return canGlassFractureSplit(prop, minSize);
    if (!isChunkFracture(prop)) return false;
    const shape = prop.shape;
    const { x, y } = shape?.type === "Polygon" ? convexFootprintHalfExtents(shape.vertices) : { x: prop.radius, y: prop.radius };
    if (x * 2 < minSize * 2 || y * 2 < minSize * 2) return false;
    return Boolean(prop.chunks && prop.chunks.length > 1);
}
function flatVertsFromShape(prop) {
    const shape = prop.shape;
    const flat = new Float32Array(shape.vertices.length * 2);
    for (let i = 0; i < shape.vertices.length; i++) {
        flat[i * 2] = shape.vertices[i].x;
        flat[i * 2 + 1] = shape.vertices[i].y;
    }
    return flat;
}
export function initFractureFootprint(prop) {
    if (isGlassFracture(prop)) return;
    if (!isChunkFracture(prop)) throw new Error(`Fracture props need fractureMode "chunk" or "glass", got ${prop.strategy?.fractureMode}`);
    applyChunkGeometryToProp(prop, bakeChunkOutline(flatVertsFromShape(prop)));
}
function applyFractureGeometryToProp(prop, geometry) {
    prop.footprintVertices = geometry.footprintVertices;
    prop.footprintArea = geometry.footprintArea;
    prop.radius = geometry.boundingRadius;
    const count = geometry.footprintVertices.length / 2;
    const verts = [];
    for (let i = 0; i < count; i++) verts.push({ x: geometry.footprintVertices[i * 2], y: geometry.footprintVertices[i * 2 + 1] });
    prop.shape = new PolygonShape(verts);
    prop.chunks = undefined;
    prop.collisionParts = undefined;
    invalidateBroadphaseBounds(prop);
    syncKineticRigidBody(prop);
}
export function applyChunkGeometryToProp(prop, geometry) {
    prop.chunks = geometry.chunks;
    prop.collisionParts = geometry.collisionParts;
    prop.footprintVertices = geometry.footprintVertices;
    prop.footprintArea = geometry.footprintArea;
    prop.radius = geometry.boundingRadius;
    prop.shape = geometry.collisionParts[0];
    invalidateBroadphaseBounds(prop);
    syncKineticRigidBody(prop);
}
export function applyShardGeometryToProp(prop, geometry) {
    applyFractureGeometryToProp(prop, geometry);
}
function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}
function propFacing(prop) {
    return prop.facing ?? prop.angle ?? 0;
}
function currentPropMotion(prop) {
    const physId = prop._physId;
    if (physId !== undefined) return { vx: kineticDynamicSlab.vx[physId], vy: kineticDynamicSlab.vy[physId], w: kineticDynamicSlab.w[physId] };
    return { vx: prop.vx ?? 0, vy: prop.vy ?? 0, w: prop.angularVelocity ?? 0 };
}
function circleShardCount(impactForce, minShards, maxShards) {
    return clamp(Math.round(3.5 + impactForce * 0.02), minShards, maxShards);
}
export function buildCircleImpactShards(radius, localHit, impactForce, { minShards = 4, maxShards = 5 } = {}) {
    const count = circleShardCount(impactForce, minShards, maxShards);
    const hitDist = Math.hypot(localHit.x, localHit.y);
    const inset = hitDist > 1e-6 ? Math.min(radius * 0.42, hitDist * 0.45) / hitDist : 0;
    const apex = { x: localHit.x * inset, y: localHit.y * inset };
    const start = Math.atan2(localHit.y, localHit.x) - Math.PI / count;
    const shards = [];
    for (let i = 0; i < count; i++) {
        const a0 = start + (i * Math.PI * 2) / count;
        const a1 = start + ((i + 1) * Math.PI * 2) / count;
        shards.push(
            buildShardGeometry([
                { x: apex.x, y: apex.y },
                { x: Math.cos(a0) * radius, y: Math.sin(a0) * radius },
                { x: Math.cos(a1) * radius, y: Math.sin(a1) * radius },
            ]),
        );
    }
    return shards;
}
export function spawnShardPropsFromGeometry(world, sourceProp, geometries, shardPropId, spatialFrame = null, configureShard = null) {
    const facing = propFacing(sourceProp);
    const cos = Math.cos(facing);
    const sin = Math.sin(facing);
    const motion = currentPropMotion(sourceProp);
    const spawned = [];
    for (let i = 0; i < geometries.length; i++) {
        const geom = geometries[i];
        const worldPos = transformPoint2DInto({ x: 0, y: 0 }, sourceProp.x, sourceProp.y, geom.centroid.cx, geom.centroid.cy, cos, sin);
        const shard = acquireWorldProp(worldPos.x, worldPos.y, shardPropId, facing);
        if (geom.collisionParts) applyChunkGeometryToProp(shard, geom);
        else applyShardGeometryToProp(shard, geom);
        shard.faction = sourceProp.faction;
        shard.vx = motion.vx;
        shard.vy = motion.vy;
        shard.angularVelocity = motion.w;
        shard._glassFractureCooldown = GLASS_FRACTURE_COOLDOWN_STEPS;
        if (configureShard) configureShard(shard, geom, i);
        spawned.push(shard);
    }
    if (spawned.length > 0) {
        addWorldPropsToState(world, spawned);
        for (let i = 0; i < spawned.length; i++) wakeKineticBody(spawned[i]);
        if (spatialFrame?.admitKineticProps && spatialFrame.populatedMembershipGen >= 0) spatialFrame.admitKineticProps(spawned, world);
        else if (spatialFrame?.admitKineticProp && spatialFrame.populatedMembershipGen >= 0) for (let i = 0; i < spawned.length; i++) spatialFrame.admitKineticProp(spawned[i], world);
    }
    return spawned;
}
export function spawnGlassShatterShards(world, sourceProp, fracture, spatialFrame = null) {
    const cos = Math.cos(fracture.facing);
    const sin = Math.sin(fracture.facing);
    const impactWorld = transformPoint2DInto({ x: 0, y: 0 }, fracture.originX, fracture.originY, fracture.impactLocal.x, fracture.impactLocal.y, cos, sin);
    const burst = Math.min(35, 8 + fracture.impactForce * 0.12);
    return spawnShardPropsFromGeometry(world, sourceProp, fracture.debris, sourceProp.type, spatialFrame, (frag, geom, i) => {
        const worldPos = transformPoint2DInto({ x: 0, y: 0 }, fracture.originX, fracture.originY, geom.centroid.cx, geom.centroid.cy, cos, sin);
        const dx = worldPos.x - impactWorld.x;
        const dy = worldPos.y - impactWorld.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 1e-6) {
            frag.vx += (dx / dist) * burst;
            frag.vy += (dy / dist) * burst;
        }
        frag.angularVelocity += (Math.random() - 0.5) * 0.4;
        frag._glassFractureCooldown = GLASS_FRACTURE_COOLDOWN_STEPS;
    });
}
export function spawnChunkFractureShards(world, sourceProp, fracture, spatialFrame = null) {
    return spawnShardPropsFromGeometry(world, sourceProp, fracture.debris, sourceProp.type, spatialFrame);
}
function splitMeshComponents(cells, localHitX, localHitY, impactForce, forceExplode) {
    if (!cells?.length) return [];
    let components = splitPoxels(cells, localHitX, localHitY, impactForce);
    if (forceExplode && cells.length > 1) components = cells.map((cell) => [cell]);
    return components;
}
function geometryFromChunkComponent(comp, atOrigin) {
    const parts = comp.map((chunk) => ({ vertices: chunk.vertices }));
    return atOrigin ? buildChunkGeometryAtPropOrigin(parts) : buildGeometryFromChunkParts(parts);
}
export function splitFootprintIntoComponents(prop, localHitX, localHitY, impactForce, forceExplode = false) {
    return splitMeshComponents(prop.chunks, localHitX, localHitY, impactForce, forceExplode).map((comp) => geometryFromChunkComponent(comp, false));
}
function propWorldPosition(prop) {
    const physId = prop._physId;
    if (physId !== undefined) return { x: kineticDynamicSlab.x[physId], y: kineticDynamicSlab.y[physId] };
    return { x: prop.x, y: prop.y };
}
function peelSolidFracture(prop, localHitX, localHitY, impactForce) {
    const components = splitMeshComponents(prop.chunks, localHitX, localHitY, impactForce, false);
    if (components.length <= 1) return null;
    components.sort((a, b) => b.length - a.length);
    const { x: originX, y: originY } = propWorldPosition(prop);
    const debris = components.slice(1).map((comp) => geometryFromChunkComponent(comp, false));
    applyChunkGeometryToProp(prop, geometryFromChunkComponent(components[0], true));
    return { debris, originX, originY, facing: prop.facing };
}
export function worldHitToPropLocal(prop, worldX, worldY) {
    const pos = propWorldPosition(prop);
    const dx = worldX - pos.x;
    const dy = worldY - pos.y;
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
    const { x: originX, y: originY } = propWorldPosition(prop);
    return { debris, originX, originY, facing: prop.facing, impactLocal: local, impactForce };
}
export function fracturePropOnImpact(prop, worldHitX, worldHitY, impactForce) {
    if (isGlassFracture(prop)) return fractureGlassOnImpact(prop, worldHitX, worldHitY, impactForce);
    if (!canFracturePropSplit(prop)) return null;
    const local = worldHitToPropLocal(prop, worldHitX, worldHitY);
    return peelSolidFracture(prop, local.x, local.y, impactForce);
}
function evictFracturedProp(world, prop, spatialFrame) {
    removeWorldPropFromState(world, prop, spatialFrame);
}
const deferredFractures = [];
let deferredFracturesCount = 0;
export function queueFractureKineticContact(tick, bodyA, bodyB, hitX, hitY, relativeSpeed) {
    const { frame, world } = tick;
    const force = impactForceFromContact(relativeSpeed, bodyA.mass, bodyB.mass);
    for (let i = 0; i < 2; i++) {
        const prop = i === 0 ? bodyA : bodyB;
        const other = i === 0 ? bodyB : bodyA;
        if (prop._physId === undefined) continue;
        if (!canFracturePropSplit(prop)) continue;
        if (prop._glassFractureCooldown > 0) continue;
        if (isGlassFracture(prop) && isGlassFracture(other)) continue;
        const threshold = isGlassFracture(prop) ? GLASS_FRACTURE_IMPACT_THRESHOLD : FRACTURE_IMPACT_THRESHOLD;
        if (force < threshold) continue;
        if (prop._pendingEviction) continue;
        const fracture = fracturePropOnImpact(prop, hitX, hitY, force);
        if (!fracture) continue;
        prop._pendingEviction = true;
        let item = deferredFractures[deferredFracturesCount];
        if (!item) {
            item = { type: "", prop: null, fracture: null };
            deferredFractures[deferredFracturesCount] = item;
        }
        item.type = isGlassFracture(prop) ? "glass" : "chunk";
        item.prop = prop;
        item.fracture = fracture;
        deferredFracturesCount++;
        return;
    }
}
export function flushDeferredFractures(world, spatialFrame) {
    if (deferredFracturesCount === 0) return;
    world.entityRegistry.beginMembershipBatch();
    const propsToAdmit = [];
    try {
        for (let i = 0; i < deferredFracturesCount; i++) {
            const item = deferredFractures[i];
            const prop = item.prop;
            delete prop._pendingEviction;
            if (item.type === "glass") {
                evictFracturedProp(world, prop, spatialFrame);
                const shards = spawnGlassShatterShards(world, prop, item.fracture, spatialFrame);
                for (let j = 0; j < shards.length; j++) propsToAdmit.push(shards[j]);
            } else {
                wakeKineticBody(prop);
                const shards = spawnChunkFractureShards(world, prop, item.fracture, spatialFrame);
                for (let j = 0; j < shards.length; j++) propsToAdmit.push(shards[j]);
                propsToAdmit.push(prop);
            }
            item.prop = null;
            item.fracture = null;
        }
        if (propsToAdmit.length > 0)
            if (spatialFrame?.admitKineticProps) spatialFrame.admitKineticProps(propsToAdmit, world);
            else if (spatialFrame?.admitKineticProp) for (let j = 0; j < propsToAdmit.length; j++) spatialFrame.admitKineticProp(propsToAdmit[j], world);
    } finally {
        world.entityRegistry.endMembershipBatch();
        deferredFracturesCount = 0;
    }
}
export function tryFractureKineticContact(tick, bodyA, bodyB, hitX, hitY, relativeSpeed) {
    queueFractureKineticContact(tick, bodyA, bodyB, hitX, hitY, relativeSpeed);
    flushDeferredFractures(tick.world, tick.frame);
}
