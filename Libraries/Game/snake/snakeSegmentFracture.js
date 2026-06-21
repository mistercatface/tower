import { addWorldPropToState, removeWorldPropFromState } from "../../../GameState/EntityRegistry.js";
import { getSandboxEntityMeta } from "../../../GameState/sandboxEntityMeta.js";
import { WorldProp } from "../../../Entities/WorldProp.js";
import { transformPoint2DInto } from "../../Math/Poly2D.js";
import { wakeKineticBody } from "../../Motion/kineticSleep.js";
import { kineticBodySlab } from "../../Spatial/collision/kineticBodySlab.js";
import { KINETIC_PAIR_TIER } from "../../Spatial/collision/kineticNarrowPhase.js";
import { kineticPairBodiesAt } from "../../Spatial/collision/kineticPairStream.js";
import { getCirclePropRadius } from "../../Props/propScale.js";
import { applyShardGeometryToProp } from "../../Props/propFracture.js";
import { buildShardGeometry, GLASS_FRACTURE_COOLDOWN_STEPS } from "../../Props/glassFracture.js";
import { getSnakeGameConfig } from "./snakeGameConfig.js";
export const SNAKE_SHARD_PROP_ID = "snake_shard";
const FRACTURABLE_DEAD_SEGMENT_FLAG = "_snakeFracturableDeadSegment";
const MIN_SNAKE_SHARDS = 4;
const MAX_SNAKE_SHARDS = 5;
const FALLBACK_IMPACT_FORCE = 26;
function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}
function propFacing(prop) {
    return prop.facing ?? prop.angle ?? 0;
}
function worldToSegmentLocal(segment, worldX, worldY) {
    const dx = worldX - segment.x;
    const dy = worldY - segment.y;
    const facing = propFacing(segment);
    const cos = Math.cos(facing);
    const sin = Math.sin(facing);
    return { x: dx * cos + dy * sin, y: -dx * sin + dy * cos };
}
function segmentLocalToWorld(segment, localX, localY) {
    const facing = propFacing(segment);
    return transformPoint2DInto({ x: 0, y: 0 }, segment.x, segment.y, localX, localY, Math.cos(facing), Math.sin(facing));
}
function copyVisualOverride(from, to) {
    if (from.visualOverride) to.visualOverride = { ...from.visualOverride };
}
function markDeadSegmentFracturable(segment) {
    if (segment) segment[FRACTURABLE_DEAD_SEGMENT_FLAG] = true;
}
export function markSnakeSegmentsFracturable(state, memberIds) {
    for (let i = 0; i < memberIds.length; i++) markDeadSegmentFracturable(state.entityRegistry.get(memberIds[i]));
}
function defaultSegmentLocalHit(radius, index) {
    const angle = index * 1.61803398875;
    return { x: Math.cos(angle) * radius * 0.3, y: Math.sin(angle) * radius * 0.3 };
}
function resolveSegmentImpact(segment, radius, deathImpact, index) {
    const baseForce = deathImpact?.impactForce ?? deathImpact?.force ?? FALLBACK_IMPACT_FORCE;
    if (deathImpact?.worldX != null && deathImpact?.worldY != null) {
        const local = worldToSegmentLocal(segment, deathImpact.worldX, deathImpact.worldY);
        const dist = Math.hypot(local.x, local.y);
        const scale = dist > radius && dist > 1e-6 ? radius / dist : 1;
        const hit = { x: local.x * scale, y: local.y * scale };
        const worldHit = segmentLocalToWorld(segment, hit.x, hit.y);
        return { localHit: hit, worldHit, impactForce: Math.max(8, baseForce) };
    }
    const localHit = defaultSegmentLocalHit(radius, index);
    return { localHit, worldHit: segmentLocalToWorld(segment, localHit.x, localHit.y), impactForce: baseForce };
}
function snakeShardCount(impactForce) {
    return clamp(Math.round(3.5 + impactForce * 0.02), MIN_SNAKE_SHARDS, MAX_SNAKE_SHARDS);
}
function buildSnakeCircleShards(radius, localHit, impactForce) {
    const count = snakeShardCount(impactForce);
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
export function fractureSnakeSegmentGeometry(segment, impact, random = Math.random) {
    const radius = getCirclePropRadius(segment) ?? segment.radius ?? 0;
    if (radius <= 0) return [];
    return buildSnakeCircleShards(radius, impact.localHit, impact.impactForce);
}
function currentSegmentMotion(segment) {
    const physId = segment._physId;
    if (physId !== undefined) return { vx: kineticBodySlab.vx[physId], vy: kineticBodySlab.vy[physId], w: kineticBodySlab.w[physId] };
    return { vx: segment.vx ?? 0, vy: segment.vy ?? 0, w: segment.angularVelocity ?? 0 };
}
export function spawnSnakeSegmentShards(state, segment, impact, spatialFrame = null, random = Math.random) {
    const geometries = fractureSnakeSegmentGeometry(segment, impact, random);
    const facing = propFacing(segment);
    const cos = Math.cos(facing);
    const sin = Math.sin(facing);
    const motion = currentSegmentMotion(segment);
    const foodValue = getSnakeGameConfig().metabolism.growthCost / geometries.length;
    const spawned = [];
    for (let i = 0; i < geometries.length; i++) {
        const geom = geometries[i];
        const worldPos = transformPoint2DInto({ x: 0, y: 0 }, segment.x, segment.y, geom.centroid.cx, geom.centroid.cy, cos, sin);
        const shard = new WorldProp(worldPos.x, worldPos.y, SNAKE_SHARD_PROP_ID, facing);
        applyShardGeometryToProp(shard, geom);
        copyVisualOverride(segment, shard);
        shard.faction = segment.faction;
        shard.vx = motion.vx;
        shard.vy = motion.vy;
        shard.angularVelocity = motion.w;
        shard.snakeFoodValue = foodValue;
        shard._glassFractureCooldown = GLASS_FRACTURE_COOLDOWN_STEPS;
        addWorldPropToState(state, shard);
        wakeKineticBody(shard);
        if (spatialFrame?.admitKineticProp && spatialFrame.populatedMembershipGen >= 0) spatialFrame.admitKineticProp(shard, state);
        spawned.push(shard);
    }
    return spawned;
}
export function shatterSnakeSegments(state, spatialFrame, memberIds, deathImpact = null, random = Math.random) {
    markSnakeSegmentsFracturable(state, memberIds);
    if (deathImpact?.struckSegmentId == null) return { spawned: [], removedSegments: [] };
    const meta = getSandboxEntityMeta(state);
    const spawned = [];
    const removedSegments = [];
    for (let i = 0; i < memberIds.length; i++) {
        if (memberIds[i] !== deathImpact.struckSegmentId) continue;
        const segment = state.entityRegistry.get(memberIds[i]);
        if (!segment) continue;
        const radius = getCirclePropRadius(segment) ?? segment.radius ?? 0;
        const impact = resolveSegmentImpact(segment, radius, deathImpact, i);
        spawned.push(...spawnSnakeSegmentShards(state, segment, impact, spatialFrame, random));
        removeWorldPropFromState(state, segment, spatialFrame ?? undefined, meta);
        removedSegments.push(segment);
    }
    return { spawned, removedSegments };
}
function contactWorldPointForBody(contacts, i, targetBody) {
    const physIdA = contacts.physIdA[i];
    const physIdB = contacts.physIdB[i];
    const nx = contacts.nx[i];
    const ny = contacts.ny[i];
    if (contacts.tier[i] === KINETIC_PAIR_TIER.CIRCLE_CIRCLE) {
        if (targetBody._physId === physIdB) return { x: kineticBodySlab.x[physIdB] + nx * kineticBodySlab.r[physIdB], y: kineticBodySlab.y[physIdB] + ny * kineticBodySlab.r[physIdB] };
        return { x: kineticBodySlab.x[physIdA] - nx * kineticBodySlab.r[physIdA], y: kineticBodySlab.y[physIdA] - ny * kineticBodySlab.r[physIdA] };
    }
    if (targetBody._physId === physIdB) return { x: kineticBodySlab.x[physIdB] + contacts.rbx[i], y: kineticBodySlab.y[physIdB] + contacts.rby[i] };
    return { x: kineticBodySlab.x[physIdA] + contacts.rax[i], y: kineticBodySlab.y[physIdA] + contacts.ray[i] };
}
function tryFractureRetiredSegment(state, spatialFrame, contacts, i, segment, fracturedIds) {
    if (!segment?.[FRACTURABLE_DEAD_SEGMENT_FLAG]) return false;
    if (fracturedIds.has(segment.id)) return false;
    const relSpeed = Math.hypot(contacts.preDvx[i], contacts.preDvy[i]);
    if (relSpeed < getSnakeGameConfig().splitImpulseThreshold) return false;
    const hit = contactWorldPointForBody(contacts, i, segment);
    const fracture = shatterSnakeSegments(state, spatialFrame, [segment.id], { worldX: hit.x, worldY: hit.y, impactForce: relSpeed, struckSegmentId: segment.id, spatialFrame });
    if (fracture.spawned.length === 0) return false;
    fracturedIds.add(segment.id);
    return true;
}
export function fractureRetiredSnakeSegmentsFromContacts(state, spatialFrame, contacts) {
    if (contacts.count === 0) return;
    const fracturedIds = new Set();
    for (let i = 0; i < contacts.count; i++) {
        const pair = kineticPairBodiesAt(spatialFrame, contacts.physIdA[i], contacts.physIdB[i]);
        if (!pair) continue;
        if (tryFractureRetiredSegment(state, spatialFrame, contacts, i, pair.bodyA, fracturedIds)) continue;
        tryFractureRetiredSegment(state, spatialFrame, contacts, i, pair.bodyB, fracturedIds);
    }
}
