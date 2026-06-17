import { getCollisionSettings } from "../../../Core/GameCollisionSettings.js";
import { canSplittableWorldPropSplit } from "../../Props/splittable.js";
import { invalidateWallResolveCache } from "../../Motion/WallCollisionResolver.js";
import { massFromBody } from "../../Motion/bodyMass.js";
import { wakePushableBody } from "../../Motion/pushableSleep.js";
import { distanceSqToSegment } from "../geometry/WallGeometry.js";
import { resolveCirclePair } from "./circlePair.js";
import { circlesOverlap, findFirstCircleSegmentHit } from "./overlap.js";
import { resolveSatPair } from "./satPair.js";
function pushablePairRestitution(p1, p2) {
    const r1 = p1.strategy?.pairRestitution;
    const r2 = p2.strategy?.pairRestitution;
    if (r1 != null && r2 != null) return (r1 + r2) * 0.5;
    return r1 ?? r2 ?? getCollisionSettings().restitution.pushablePair;
}
function applyPushableCollisionDamage(body, dmg, state) {
    if (dmg <= 0 || !body.takeDamage) return;
    if (body.strategy?.splittable && !canSplittableWorldPropSplit(body)) return;
    body.takeDamage(dmg, state);
}
/** @param {object} prop @param {object[]} wallCandidates */
function pushableOverlapsWallSegment(prop, wallCandidates) {
    const shape = prop.getShape();
    if (shape.type !== "Circle") return false;
    const radiusSq = prop.radius * prop.radius;
    for (let i = 0; i < wallCandidates.length; i++) {
        const seg = wallCandidates[i];
        if (seg.isDead) continue;
        if (distanceSqToSegment(seg, prop.x, prop.y) <= radiusSq) return true;
    }
    return false;
}
function resolvePushablePair(p1, p2, state) {
    const shapeA = p1.getShape();
    const shapeB = p2.getShape();
    const restitution = pushablePairRestitution(p1, p2);
    // Calculate pre-collision relative velocity for damage
    const preDvx = p2.vx - p1.vx;
    const preDvy = p2.vy - p1.vy;
    const preSpeedSq = preDvx * preDvx + preDvy * preDvy;
    if (shapeA.type === "Circle" && shapeB.type === "Circle") {
        if (resolveCirclePair(p1, p2, { restitution })) {
            if (preSpeedSq > 8000) {
                const dmg = Math.floor(Math.sqrt(preSpeedSq) / 60);
                applyPushableCollisionDamage(p1, dmg, state);
                applyPushableCollisionDamage(p2, dmg, state);
            }
            invalidateWallResolveCache(p1, p2);
            wakePushableBody(p1);
            wakePushableBody(p2);
        }
        return;
    }
    const collisionInfo = resolveSatPair(p1, shapeA, p2, shapeB, { massA: massFromBody(p1), massB: massFromBody(p2), restitution });
    if (!collisionInfo) return;
    // Apply damage on high-speed impacts using pre-collision speed
    if (preSpeedSq > 8000) {
        const dmg = Math.floor(Math.sqrt(preSpeedSq) / 60);
        applyPushableCollisionDamage(p1, dmg, state);
        applyPushableCollisionDamage(p2, dmg, state);
    }
    invalidateWallResolveCache(p1, p2);
    wakePushableBody(p1);
    wakePushableBody(p2);
}
/**
 * Staged collision pass: projectiles → pushable iterations.
 * Game layer supplies filters and entity callbacks.
 *
 * @param {object} state
 * @param {object} spatialFrame
 * @param {{
 *   projectiles: object[],
 *   projectileWorldPropFilter: { allows: (a: object, b: object) => boolean },
 *   onProjectileWallHit: (projectile: object, segment: object, events: object[]) => void,
 *   onProjectileWorldPropHit: (projectile: object, prop: object, events: object[]) => boolean,
 *   onProjectileFactionCollisions: (projectile: object, events: object[]) => void,
 *   resolveWalls: (entity: object, spatialFrame: object) => void,
 *   pushableIterations?: number,
 *   events?: object[],
 * }} hooks
 * @returns {object[]}
 */
export function runCollisionPipeline(
    state,
    spatialFrame,
    {
        projectiles,
        projectileWorldPropFilter,
        onProjectileWallHit,
        onProjectileWorldPropHit,
        onProjectileFactionCollisions,
        resolveWalls,
        pushableIterations = getCollisionSettings().pushableIterations,
        events = null,
    },
) {
    const out = events ?? [];
    if (!events) out.length = 0;
    if (projectiles?.length > 0)
        for (let i = 0; i < projectiles.length; i++) {
            const p = projectiles[i];
            if (p.isDead) continue;
            const wallCandidates = spatialFrame.getWallCandidates(p);
            const segment = findFirstCircleSegmentHit(p, wallCandidates);
            if (segment) {
                onProjectileWallHit(p, segment, out);
                continue;
            }
            let hitWorldProp = false;
            spatialFrame.forEachNeighbor(p, (prop) => {
                if (hitWorldProp || !projectileWorldPropFilter.allows(p, prop)) return;
                if (!circlesOverlap(p, prop)) return;
                if (onProjectileWorldPropHit(p, prop, out)) hitWorldProp = true;
            });
            if (hitWorldProp) continue;
            onProjectileFactionCollisions(p, out);
        }
    const activePushables = spatialFrame._activePushables;
    const hasActivePushables = activePushables.length > 0;
    if (hasActivePushables)
        for (let i = 0; i < activePushables.length; i++) {
            const prop = activePushables[i];
            prop._frameDispX = prop.x - (prop._wallDispPrevX ?? prop.x);
            prop._frameDispY = prop.y - (prop._wallDispPrevY ?? prop.y);
        }
    if (hasActivePushables)
        for (let iter = 0; iter < pushableIterations; iter++) {
            spatialFrame.forEachPushablePair((p1, p2) => resolvePushablePair(p1, p2, state));
            for (let i = 0; i < activePushables.length; i++) {
                const prop = activePushables[i];
                if (prop.isDead || !prop.strategy?.isPushable) continue;
                const wallCandidates = spatialFrame.getWallCandidates(prop);
                if (!prop.needsWallCollision() && !pushableOverlapsWallSegment(prop, wallCandidates)) continue;
                resolveWalls(prop, spatialFrame);
            }
        }
    if (hasActivePushables)
        for (let i = 0; i < activePushables.length; i++) {
            const prop = activePushables[i];
            prop._wallDispPrevX = prop.x;
            prop._wallDispPrevY = prop.y;
        }
    return out;
}
