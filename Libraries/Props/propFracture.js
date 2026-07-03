import { addWorldPropToState, removeWorldPropFromState, addWorldPropsToState } from "../../GameState/EntityRegistry.js";
import { WorldProp } from "../../Entities/WorldProp.js";
import { resolveSandboxFaction } from "../Sandbox/sandboxFaction.js";
import { transformPoint2DInto, convexFootprintHalfExtents, polygonSignedArea2D } from "../Math/Poly2D.js";
import { syncKineticRigidBody } from "../Motion/bodyMass.js";
import { invalidateBroadphaseBounds } from "../Spatial/collision/entityBroadphase.js";
import { kineticDynamicSlab } from "../Spatial/collision/kineticBodySlab.js";
import { kineticPairBodyAt, KINETIC_PAIR_TIER } from "../Spatial/collision/kineticPairStream.js";
import { PolygonShape } from "../Spatial/collision/Shapes.js";
import { wakeKineticBody } from "../Motion/kineticSleep.js";
import { splitPoxels } from "./poxelFracture.js";
import { bakeChunkOutline, buildChunkGeometryAtPropOrigin, buildGeometryFromChunkParts, chunkNeedsMinCellSubdivide, subdivideSingleChunkAtMinCell } from "./chunkFracture.js";
import { buildShardGeometry, GLASS_FRACTURE_COOLDOWN_STEPS, GLASS_FRACTURE_IMPACT_THRESHOLD, minShardAreaForPolygon, shatterGlassPolygon, wedgePolygonIntersection } from "./glassFracture.js";
import { acquireWorldProp } from "./worldPropPool.js";
import { clearChainLinksForProp } from "../Sandbox/chainLinks.js";
export const FRACTURE_MIN_PIECE_SIZE = 5;
export const FRACTURE_IMPACT_THRESHOLD = 12;
function isGlassFracture(prop) {
    return prop?.strategy?.fracture?.mode === "glass";
}
function isChunkFracture(prop) {
    return prop?.strategy?.fracture?.mode === "chunk";
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
    if (x * 2 < minSize || y * 2 < minSize) return false;
    if (!prop.chunks?.length) return false;
    if (prop.chunks.length > 1) return true;
    return chunkNeedsMinCellSubdivide(prop.chunks[0]);
}
function ensureChunkFractureGrid(prop) {
    if (prop.chunks?.length !== 1) return;
    const geom = subdivideSingleChunkAtMinCell(prop.chunks[0]);
    if (geom) applyChunkGeometryToProp(prop, geom);
}
function flatVertsFromShape(prop) {
    return prop.shape.vertices;
}
export function initFractureFootprint(prop) {
    if (isGlassFracture(prop)) return;
    if (!isChunkFracture(prop)) throw new Error(`Fracture props need fracture.mode "chunk" or "glass", got ${prop.strategy?.fracture?.mode}`);
    applyChunkGeometryToProp(prop, bakeChunkOutline(flatVertsFromShape(prop)));
}
function applyFractureGeometryToProp(prop, geometry) {
    prop.footprintVertices = geometry.footprintVertices;
    prop.footprintArea = geometry.footprintArea;
    prop.radius = geometry.boundingRadius;
    prop.shape = new PolygonShape(geometry.footprintVertices);
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
    prop.shape = new PolygonShape(geometry.footprintVertices);
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
    const polySides = 16;
    const parentPoints = new Float32Array(polySides * 2);
    for (let i = 0; i < polySides; i++) {
        const angle = (i * Math.PI * 2) / polySides;
        parentPoints[i * 2] = Math.cos(angle) * radius;
        parentPoints[i * 2 + 1] = Math.sin(angle) * radius;
    }
    const shards = [];
    for (let i = 0; i < count; i++) {
        const a0 = start + (i * Math.PI * 2) / count;
        const a1 = start + ((i + 1) * Math.PI * 2) / count;
        const poly = wedgePolygonIntersection(parentPoints, apex.x, apex.y, a0, a1);
        if (poly.length >= 6) shards.push(buildShardGeometry(poly));
    }
    return shards;
}
export function spawnShardPropsFromGeometry(world, sourceProp, geometries, shardPropId, spatialFrame = null, configureShard = null) {
    const facing = propFacing(sourceProp);
    const cos = Math.cos(facing);
    const sin = Math.sin(facing);
    const motion = currentPropMotion(sourceProp);
    const faction = sourceProp.faction;
    const wallChunkProfileId = sourceProp.wallChunkProfileId;
    const wallChunkHeightPx = sourceProp.wallChunkHeightPx;
    const spawned = [];
    const physId = sourceProp._physId;
    const wx = physId !== undefined ? kineticDynamicSlab.x[physId] : sourceProp.x;
    const wy = physId !== undefined ? kineticDynamicSlab.y[physId] : sourceProp.y;
    for (let i = 0; i < geometries.length; i++) {
        const geom = geometries[i];
        const worldPos = transformPoint2DInto({ x: 0, y: 0 }, wx, wy, geom.centroid.cx, geom.centroid.cy, cos, sin);
        const shard = acquireWorldProp(worldPos.x, worldPos.y, shardPropId, facing);
        if (geom.collisionParts) applyChunkGeometryToProp(shard, geom);
        else applyShardGeometryToProp(shard, geom);
        shard.faction = faction;
        shard.vx = motion.vx;
        shard.vy = motion.vy;
        shard.angularVelocity = motion.w;
        shard._glassFractureCooldown = GLASS_FRACTURE_COOLDOWN_STEPS;
        if (sourceProp.visualOverride !== undefined) shard.visualOverride = { ...sourceProp.visualOverride };
        if (wallChunkProfileId !== undefined) {
            shard.wallChunkProfileId = wallChunkProfileId;
            shard.wallChunkHeightPx = wallChunkHeightPx;
        }
        if (configureShard) configureShard(shard, geom, i);
        spawned.push(shard);
    }
    if (spawned.length > 0) {
        addWorldPropsToState(world, spawned);
        for (let i = 0; i < spawned.length; i++) wakeKineticBody(spawned[i]);
        if (spatialFrame?.admitKineticProps) spatialFrame.admitKineticProps(spawned, world);
        else if (spatialFrame?.admitKineticProp) for (let i = 0; i < spawned.length; i++) spatialFrame.admitKineticProp(spawned[i], world);
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
function peelSolidFracture(prop, localHitX, localHitY, impactForce) {
    const components = splitMeshComponents(prop.chunks, localHitX, localHitY, impactForce, false);
    if (components.length <= 1) return null;
    components.sort((a, b) => b.length - a.length);
    const physId = prop._physId;
    const wx = physId !== undefined ? kineticDynamicSlab.x[physId] : prop.x;
    const wy = physId !== undefined ? kineticDynamicSlab.y[physId] : prop.y;
    const mainGeom = geometryFromChunkComponent(components[0], false);
    const cos = Math.cos(propFacing(prop));
    const sin = Math.sin(propFacing(prop));
    const mainWorldPos = transformPoint2DInto({ x: 0, y: 0 }, wx, wy, mainGeom.centroid.cx, mainGeom.centroid.cy, cos, sin);
    prop.x = mainWorldPos.x;
    prop.y = mainWorldPos.y;
    if (physId !== undefined && physId !== -1) {
        kineticDynamicSlab.x[physId] = mainWorldPos.x;
        kineticDynamicSlab.y[physId] = mainWorldPos.y;
    }
    const debris = components.slice(1).map((comp) => geometryFromChunkComponent(comp, false));
    applyChunkGeometryToProp(prop, mainGeom);
    return { debris, originX: wx, originY: wy, facing: propFacing(prop) };
}
export function worldHitToPropLocal(prop, worldX, worldY) {
    const physId = prop._physId;
    const wx = physId !== undefined ? kineticDynamicSlab.x[physId] : prop.x;
    const wy = physId !== undefined ? kineticDynamicSlab.y[physId] : prop.y;
    const dx = worldX - wx;
    const dy = worldY - wy;
    const cos = Math.cos(propFacing(prop));
    const sin = Math.sin(propFacing(prop));
    return { x: dx * cos + dy * sin, y: -dx * sin + dy * cos };
}
export function impactForceFromContact(relativeSpeed, massA = 1, massB = 1) {
    return relativeSpeed * 0.5 + Math.sqrt(massA * massB) * 0.3;
}
export function fractureGlassOnImpact(prop, worldHitX, worldHitY, impactForce) {
    if (!canFracturePropSplit(prop)) return null;
    const physId = prop._physId;
    const wx = physId !== undefined ? kineticDynamicSlab.x[physId] : prop.x;
    const wy = physId !== undefined ? kineticDynamicSlab.y[physId] : prop.y;
    const dx = worldHitX - wx;
    const dy = worldHitY - wy;
    const cos = Math.cos(propFacing(prop));
    const sin = Math.sin(propFacing(prop));
    const localHitX = dx * cos + dy * sin;
    const localHitY = -dx * sin + dy * cos;
    const debris = shatterGlassPolygon(flatVertsFromShape(prop), localHitX, localHitY, impactForce);
    if (debris.length < 2) return null;
    return { debris, originX: wx, originY: wy, facing: propFacing(prop), impactLocal: { x: localHitX, y: localHitY }, impactForce };
}
export function fracturePropOnImpact(prop, worldHitX, worldHitY, impactForce) {
    if (isGlassFracture(prop)) return fractureGlassOnImpact(prop, worldHitX, worldHitY, impactForce);
    ensureChunkFractureGrid(prop);
    if (!canFracturePropSplit(prop)) return null;
    const physId = prop._physId;
    const wx = physId !== undefined ? kineticDynamicSlab.x[physId] : prop.x;
    const wy = physId !== undefined ? kineticDynamicSlab.y[physId] : prop.y;
    const dx = worldHitX - wx;
    const dy = worldHitY - wy;
    const cos = Math.cos(propFacing(prop));
    const sin = Math.sin(propFacing(prop));
    const localHitX = dx * cos + dy * sin;
    const localHitY = -dx * sin + dy * cos;
    return peelSolidFracture(prop, localHitX, localHitY, impactForce);
}
export function fractureCirclePropOnImpact(prop, worldHitX, worldHitY, impactForce) {
    const physId = prop._physId;
    const wx = physId !== undefined ? kineticDynamicSlab.x[physId] : prop.x;
    const wy = physId !== undefined ? kineticDynamicSlab.y[physId] : prop.y;
    const dx = worldHitX - wx;
    const dy = worldHitY - wy;
    const cos = Math.cos(propFacing(prop));
    const sin = Math.sin(propFacing(prop));
    const localHitX = dx * cos + dy * sin;
    const localHitY = -dx * sin + dy * cos;
    const debris = buildCircleImpactShards(prop.radius, { x: localHitX, y: localHitY }, impactForce);
    if (debris.length === 0) return null;
    return { debris, originX: wx, originY: wy, facing: propFacing(prop), impactLocal: { x: localHitX, y: localHitY }, impactForce };
}
export function spawnCircleShatterShards(world, sourceProp, fracture, spatialFrame = null) {
    const cos = Math.cos(fracture.facing);
    const sin = Math.sin(fracture.facing);
    const impactWorld = transformPoint2DInto({ x: 0, y: 0 }, fracture.originX, fracture.originY, fracture.impactLocal.x, fracture.impactLocal.y, cos, sin);
    const burst = Math.min(35, 8 + fracture.impactForce * 0.12);
    const shardPropId = sourceProp.type === "snake" || sourceProp.type === "ball" || sourceProp.type === "boid_triangle" ? "snake_shard" : sourceProp.type;
    return spawnShardPropsFromGeometry(world, sourceProp, fracture.debris, shardPropId, spatialFrame, (frag, geom, i) => {
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
function evictFracturedProp(world, prop, spatialFrame) {
    removeWorldPropFromState(world, prop, spatialFrame);
}
const deferredFractures = [];
let deferredFracturesCount = 0;
export function queueCircleFracture(prop, hitX, hitY, force) {
    if (prop._pendingEviction) return false;
    const fracture = fractureCirclePropOnImpact(prop, hitX, hitY, force);
    if (!fracture) return false;
    prop._pendingEviction = true;
    let item = deferredFractures[deferredFracturesCount];
    if (!item) {
        item = { type: "circle", prop: null, fracture: null };
        deferredFractures[deferredFracturesCount] = item;
    }
    item.type = "circle";
    item.prop = prop;
    item.fracture = fracture;
    deferredFracturesCount++;
    return true;
}
export function evalFractureRules(prop, other, force) {
    const config = prop.strategy?.fracture;
    if (!config) return false;

    const minForce = config.minForce ?? (config.mode === "glass" ? GLASS_FRACTURE_IMPACT_THRESHOLD : FRACTURE_IMPACT_THRESHOLD);
    if (force < minForce) return false;

    if (config.threatType && other.type !== config.threatType) return false;

    const selfFaction = resolveSandboxFaction(prop);
    if (config.excludeFactions && config.excludeFactions.includes(selfFaction)) return false;

    if (config.opponentOnly) {
        const otherFaction = resolveSandboxFaction(other);
        if (selfFaction === otherFaction) return false;
    }

    return true;
}

export function queueFractureKineticContact(tick, bodyA, bodyB, hitX, hitY, force, nx = 0, ny = 0) {
    const { frame, world } = tick;
    for (let i = 0; i < 2; i++) {
        const prop = i === 0 ? bodyA : bodyB;
        const other = i === 0 ? bodyB : bodyA;
        if (prop._physId === undefined) continue;

        if (evalFractureRules(prop, other, force)) {
            const mode = prop.strategy?.fracture?.mode;
            if (mode === "circle") {
                if (queueCircleFracture(prop, hitX, hitY, force)) return;
            } else {
                if (!canFracturePropSplit(prop)) continue;
                if (prop._glassFractureCooldown > 0) continue;
                if (isGlassFracture(prop) && isGlassFracture(other)) continue;
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
            }
        }
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
            } else if (item.type === "circle") {
                clearChainLinksForProp(world, prop.id);
                evictFracturedProp(world, prop, spatialFrame);
                const shards = spawnCircleShatterShards(world, prop, item.fracture, spatialFrame);
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
// TESTING ONLY FUNTION
export function tryFractureKineticContact(tick, bodyA, bodyB, hitX, hitY, relativeSpeed) {
    const force = impactForceFromContact(relativeSpeed, bodyA.mass, bodyB.mass);
    queueFractureKineticContact(tick, bodyA, bodyB, hitX, hitY, force);
    flushDeferredFractures(tick.world, tick.frame);
}

export function processKineticContactFractures(tick, contacts) {
    if (contacts.count === 0) return;
    const slab = kineticDynamicSlab;
    for (let i = 0; i < contacts.count; i++) {
        const physIdA = contacts.physIdA[i];
        const physIdB = contacts.physIdB[i];
        const bodyA = kineticPairBodyAt(tick.frame, physIdA);
        const bodyB = kineticPairBodyAt(tick.frame, physIdB);
        const nx = contacts.dynamic.nx[i];
        const ny = contacts.dynamic.ny[i];
        let hitX;
        let hitY;
        if (contacts.static.tier[i] === KINETIC_PAIR_TIER.CIRCLE_CIRCLE) {
            hitX = slab.x[physIdA] - nx * slab.r[physIdA];
            hitY = slab.y[physIdA] - ny * slab.r[physIdA];
        } else {
            hitX = slab.x[physIdA] + contacts.dynamic.rax[i];
            hitY = slab.y[physIdA] + contacts.dynamic.ray[i];
        }
        const relSpeed = Math.hypot(contacts.dynamic.preDvx[i], contacts.dynamic.preDvy[i]);
        const force = impactForceFromContact(relSpeed, bodyA.mass, bodyB.mass);
        queueFractureKineticContact(tick, bodyA, bodyB, hitX, hitY, force, nx, ny);
    }
    flushDeferredFractures(tick.world, tick.frame);
}
