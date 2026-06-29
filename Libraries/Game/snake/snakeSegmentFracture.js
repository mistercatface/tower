import { removeSandboxWorldProp } from "../../Sandbox/sandboxPlacedSpawn.js";
import { transformPoint2DInto } from "../../Math/Poly2D.js";
import { kineticDynamicSlab } from "../../Spatial/collision/kineticBodySlab.js";
import { KINETIC_PAIR_TIER } from "../../Spatial/collision/kineticNarrowPhase.js";
import { kineticPairBodiesAt } from "../../Spatial/collision/kineticPairStream.js";
import { getCirclePropRadius } from "../../Props/propScale.js";
import { buildCircleImpactShards, spawnShardPropsFromGeometry } from "../../Props/propFracture.js";
import { getPropCategoryIndex } from "../../../GameState/SandboxWorldState.js";
export const SNAKE_SHARD_PROP_ID = "snake_shard";
export const AMMO_SHARD_PROP_ID = "ammo_shard";
const FRACTURABLE_DEAD_SEGMENT_FLAG = "_snakeFracturableDeadSegment";
const MIN_SNAKE_SHARDS = 2;
const MAX_SNAKE_SHARDS = 3;
const FALLBACK_IMPACT_FORCE = 26;
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
function markDeadSegmentFracturable(state, segment) {
    if (segment) {
        segment[FRACTURABLE_DEAD_SEGMENT_FLAG] = true;
        getPropCategoryIndex(state, "food").register(segment);
    }
}
export function isSnakeFracturableDeadSegment(prop) {
    return prop?.[FRACTURABLE_DEAD_SEGMENT_FLAG] === true;
}
export function markSnakeSegmentsFracturable(state, memberIds) {
    for (let i = 0; i < memberIds.length; i++) markDeadSegmentFracturable(state, state.entityRegistry.get(memberIds[i]));
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
export function fractureSnakeSegmentGeometry(segment, impact, random = Math.random) {
    const radius = getCirclePropRadius(segment) ?? segment.radius ?? 0;
    if (radius <= 0) return [];
    return buildCircleImpactShards(radius, impact.localHit, impact.impactForce, { minShards: MIN_SNAKE_SHARDS, maxShards: MAX_SNAKE_SHARDS });
}
export function spawnSnakeSegmentShards(state, segment, impact, spatialFrame = null, random = Math.random) {
    const geometries = fractureSnakeSegmentGeometry(segment, impact, random);
    const config = state.sandbox.snakeGame?.config;
    const growthCost = config?.agentProfiles?.snake?.metabolism?.growthCost ?? 1.0;
    const foodValue = geometries.length ? growthCost / geometries.length : 0;
    return spawnShardPropsFromGeometry(state, segment, geometries, SNAKE_SHARD_PROP_ID, spatialFrame, (shard) => {
        copyVisualOverride(segment, shard);
        shard.snakeFoodValue = foodValue;
        getPropCategoryIndex(state, "food").register(shard);
    });
}
export function shatterSnakeSegments(state, spatialFrame, memberIds, deathImpact = null, random = Math.random) {
    markSnakeSegmentsFracturable(state, memberIds);
    if (deathImpact?.struckSegmentId == null) return { spawned: [], removedSegments: [] };
    const spawned = [];
    const removedSegments = [];
    state.entityRegistry.beginMembershipBatch();
    try {
        for (let i = 0; i < memberIds.length; i++) {
            if (memberIds[i] !== deathImpact.struckSegmentId) continue;
            const segment = state.entityRegistry.get(memberIds[i]);
            if (!segment) continue;
            const radius = getCirclePropRadius(segment) ?? segment.radius ?? 0;
            const impact = resolveSegmentImpact(segment, radius, deathImpact, i);
            spawned.push(...spawnSnakeSegmentShards(state, segment, impact, spatialFrame, random));
            removeSandboxWorldProp(state, segment, spatialFrame ?? undefined);
            removedSegments.push(segment);
        }
    } finally {
        state.entityRegistry.endMembershipBatch();
    }
    return { spawned, removedSegments };
}
function contactWorldPointForBody(contacts, i, targetBody) {
    const physIdA = contacts.physIdA[i];
    const physIdB = contacts.physIdB[i];
    const nx = contacts.dynamic.nx[i];
    const ny = contacts.dynamic.ny[i];
    if (contacts.static.tier[i] === KINETIC_PAIR_TIER.CIRCLE_CIRCLE) {
        if (targetBody._physId === physIdB) return { x: kineticDynamicSlab.x[physIdB] + nx * kineticDynamicSlab.r[physIdB], y: kineticDynamicSlab.y[physIdB] + ny * kineticDynamicSlab.r[physIdB] };
        return { x: kineticDynamicSlab.x[physIdA] - nx * kineticDynamicSlab.r[physIdA], y: kineticDynamicSlab.y[physIdA] - ny * kineticDynamicSlab.r[physIdA] };
    }
    if (targetBody._physId === physIdB) return { x: kineticDynamicSlab.x[physIdB] + contacts.dynamic.rbx[i], y: kineticDynamicSlab.y[physIdB] + contacts.dynamic.rby[i] };
    return { x: kineticDynamicSlab.x[physIdA] + contacts.dynamic.rax[i], y: kineticDynamicSlab.y[physIdA] + contacts.dynamic.ray[i] };
}
export function fractureRetiredSnakeSegmentsFromContacts(state, spatialFrame, contacts) {
    if (contacts.count === 0) return;
    const config = state.sandbox.snakeGame?.config;
    const splitImpulseThreshold = config?.splitImpulseThreshold ?? 35;
    const growthCost = config?.agentProfiles?.snake?.metabolism?.growthCost ?? 1.0;
    const fracturedIds = new Set();
    const deferredRetiredFractures = [];
    for (let i = 0; i < contacts.count; i++) {
        const pair = kineticPairBodiesAt(spatialFrame, contacts.physIdA[i], contacts.physIdB[i]);
        if (!pair) continue;
        for (let b = 0; b < 2; b++) {
            const segment = b === 0 ? pair.bodyA : pair.bodyB;
            if (!segment?.[FRACTURABLE_DEAD_SEGMENT_FLAG]) continue;
            if (fracturedIds.has(segment.id)) continue;
            const relSpeed = Math.hypot(contacts.dynamic.preDvx[i], contacts.dynamic.preDvy[i]);
            if (relSpeed < splitImpulseThreshold) continue;
            const hit = contactWorldPointForBody(contacts, i, segment);
            fracturedIds.add(segment.id);
            deferredRetiredFractures.push({ segment, hit, relSpeed });
        }
    }
    if (deferredRetiredFractures.length > 0) {
        state.entityRegistry.beginMembershipBatch();
        const spawnedShards = [];
        try {
            for (let i = 0; i < deferredRetiredFractures.length; i++) {
                const { segment, hit, relSpeed } = deferredRetiredFractures[i];
                const radius = getCirclePropRadius(segment) ?? segment.radius ?? 0;
                const impact = resolveSegmentImpact(segment, radius, { worldX: hit.x, worldY: hit.y, impactForce: relSpeed, struckSegmentId: segment.id, spatialFrame }, i);
                const geometries = fractureSnakeSegmentGeometry(segment, impact);
                const foodValue = geometries.length ? growthCost / geometries.length : 0;
                const shards = spawnShardPropsFromGeometry(state, segment, geometries, SNAKE_SHARD_PROP_ID, null, (shard) => {
                    copyVisualOverride(segment, shard);
                    shard.snakeFoodValue = foodValue;
                    getPropCategoryIndex(state, "food").register(shard);
                });
                for (let j = 0; j < shards.length; j++) spawnedShards.push(shards[j]);
                removeSandboxWorldProp(state, segment, spatialFrame ?? undefined);
            }
            if (spawnedShards.length > 0 && spatialFrame)
                if (spatialFrame.admitKineticProps) spatialFrame.admitKineticProps(spawnedShards, state);
                else if (spatialFrame.admitKineticProp) for (let j = 0; j < spawnedShards.length; j++) spatialFrame.admitKineticProp(spawnedShards[j], state);
        } finally {
            state.entityRegistry.endMembershipBatch();
        }
    }
}
export function spawnAmmoShards(state, sourceProp, amount, spatialFrame) {
    if (amount <= 0) return;
    const shardCount = Math.min(amount, 5);
    const baseAmmo = Math.floor(amount / shardCount);
    const remainder = amount % shardCount;
    const radius = getCirclePropRadius(sourceProp) ?? sourceProp.radius ?? 10;
    const geometries = buildCircleImpactShards(radius, { x: 0, y: 0 }, 20, { minShards: shardCount, maxShards: shardCount });
    spawnShardPropsFromGeometry(state, sourceProp, geometries, AMMO_SHARD_PROP_ID, spatialFrame, (shard, geom, index) => {
        shard.ammoValue = baseAmmo + (index < remainder ? 1 : 0);
        shard.visualOverride = { color: 0x00ffff };
        getPropCategoryIndex(state, "ammo").register(shard);
    });
}
