import { addWorldPropToState, removeWorldPropFromState } from "../../../GameState/EntityRegistry.js";
import { getSandboxEntityMeta } from "../../../GameState/sandboxEntityMeta.js";
import { WorldProp } from "../../../Entities/WorldProp.js";
import { transformPoint2DInto } from "../../Math/Poly2D.js";
import { wakeKineticBody } from "../../Motion/kineticSleep.js";
import { kineticBodySlab } from "../../Spatial/collision/kineticBodySlab.js";
import { getCirclePropRadius } from "../../Props/propScale.js";
import { applyShardGeometryToProp } from "../../Props/propFracture.js";
import { buildShardGeometry, GLASS_FRACTURE_COOLDOWN_STEPS, shatterGlassPolygon } from "../../Props/glassFracture.js";
export const SNAKE_SHARD_PROP_ID = "snake_shard";
const CIRCLE_FRACTURE_VERTICES = 16;
const FALLBACK_MIN_SHARDS = 4;
const FALLBACK_MAX_SHARDS = 7;
const FALLBACK_IMPACT_FORCE = 26;
function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}
function circleFlatFootprint(radius, sides = CIRCLE_FRACTURE_VERTICES) {
    const flat = new Float32Array(sides * 2);
    for (let i = 0; i < sides; i++) {
        const angle = -Math.PI / 2 + (i * Math.PI * 2) / sides;
        flat[i * 2] = Math.cos(angle) * radius;
        flat[i * 2 + 1] = Math.sin(angle) * radius;
    }
    return flat;
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
function fallbackCircleShards(radius, localHit, impactForce) {
    const count = clamp(Math.round(4 + impactForce * 0.04), FALLBACK_MIN_SHARDS, FALLBACK_MAX_SHARDS);
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
    const flat = circleFlatFootprint(radius);
    const glassShards = shatterGlassPolygon(flat, impact.localHit.x, impact.localHit.y, impact.impactForce, random);
    return glassShards.length >= 2 ? glassShards : fallbackCircleShards(radius, impact.localHit, impact.impactForce);
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
        shard._glassFractureCooldown = GLASS_FRACTURE_COOLDOWN_STEPS;
        addWorldPropToState(state, shard);
        wakeKineticBody(shard);
        if (spatialFrame?.admitKineticProp && spatialFrame.populatedMembershipGen >= 0) spatialFrame.admitKineticProp(shard, state);
        spawned.push(shard);
    }
    return spawned;
}
export function shatterSnakeSegments(state, spatialFrame, memberIds, deathImpact = null, random = Math.random) {
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
