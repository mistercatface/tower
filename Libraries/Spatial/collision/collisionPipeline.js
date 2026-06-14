import { getCollisionSettings } from "../../../Core/GameCollisionSettings.js";
import { canSplittableWorldPropSplit } from "../../Props/splittable.js";
import { invalidateWallResolveCache } from "../../Motion/WallCollisionResolver.js";
import { massFromBody } from "../../Motion/bodyMass.js";
import { applyActorPushTipImpulse } from "../../Props/actorPushTip.js";
import { wakePushableBody } from "../../Motion/pushableSleep.js";
import { shouldResolveActorPushable } from "./entityBroadphase.js";
import { distanceSqToSegment } from "../geometry/WallGeometry.js";
import { resolveCirclePair } from "./circlePair.js";
import { circlesOverlap, findFirstCircleSegmentHit } from "./overlap.js";
import { resolveSatPair } from "./satPair.js";
function resolveActorPushable(actor, prop, resolveWalls, spatialFrame, state) {
    if (!shouldResolveActorPushable(actor, prop)) return;
    const { mass, restitution } = getCollisionSettings();
    const collisionInfo = resolveSatPair(actor, actor.getShape(), prop, prop.getShape(), {
        massA: actor.mass !== undefined ? actor.mass : actor.radius,
        massB: prop.mass !== undefined ? prop.mass : mass.worldPropFallback,
        restitution: restitution.actorPushable,
    });
    if (!collisionInfo) return;
    applyActorPushTipImpulse(actor, prop, collisionInfo, state);
    invalidateWallResolveCache(actor, prop);
    wakePushableBody(prop);
    resolveWalls(actor, spatialFrame);
    resolveWalls(prop, spatialFrame);
}
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
 * Staged collision pass: projectiles → pushable iterations → entity pairs.
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
 *   tickPortalContacts: (state: object, spatialFrame: object) => void,
 *   combatantRestitution?: (a: object, b: object) => number,
 *   onChargeImpact?: (charger: object, other: object, events: object[]) => void,
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
        tickPortalContacts,
        combatantRestitution = () => getCollisionSettings().restitution.combatant,
        onChargeImpact = null,
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
    const pushables = spatialFrame._pushables;
    const combatants = spatialFrame._combatants;
    const hasPushables = pushables && pushables.length > 0;
    const hasCombatants = combatants && combatants.length > 0;
    if (hasPushables) {
        for (let i = 0; i < pushables.length; i++) {
            const prop = pushables[i];
            prop._frameDispX = prop.x - (prop._portalContactPrevX ?? prop.x);
            prop._frameDispY = prop.y - (prop._portalContactPrevY ?? prop.y);
        }
        tickPortalContacts(state, spatialFrame);
    }
    if (hasPushables || hasCombatants)
        for (let iter = 0; iter < pushableIterations; iter++) {
            if (hasCombatants && spatialFrame.forEachActorPushablePair) spatialFrame.forEachActorPushablePair((actor, prop) => resolveActorPushable(actor, prop, resolveWalls, spatialFrame, state));
            if (hasPushables) {
                spatialFrame.forEachPushablePair((p1, p2) => resolvePushablePair(p1, p2, state));
                for (let i = 0; i < pushables.length; i++) {
                    const prop = pushables[i];
                    if (prop.isDead || !prop.strategy?.isPushable) continue;
                    const wallCandidates = spatialFrame.getWallCandidates(prop);
                    if (!prop.needsWallCollision() && !pushableOverlapsWallSegment(prop, wallCandidates)) continue;
                    resolveWalls(prop, spatialFrame);
                }
            }
        }
    if (hasPushables)
        for (let i = 0; i < pushables.length; i++) {
            const prop = pushables[i];
            prop._portalContactPrevX = prop.x;
            prop._portalContactPrevY = prop.y;
        }
    if (hasCombatants && spatialFrame.forEachCombatantPair)
        spatialFrame.forEachCombatantPair((a, b) => {
            if (!circlesOverlap(a, b)) return;
            const restitution = combatantRestitution(a, b);
            if (resolveCirclePair(a, b, { restitution })) invalidateWallResolveCache(a, b);
            if (onChargeImpact) {
                if (a.attackType === "charge" && a.currentStateName !== "stunned") onChargeImpact(a, b, out);
                if (b.attackType === "charge" && b.currentStateName !== "stunned") onChargeImpact(b, a, out);
            }
        });
    return out;
}
