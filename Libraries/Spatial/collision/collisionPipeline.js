import { getCollisionSettings } from "../../../Core/GameCollisionSettings.js";
import { invalidateWallResolveCache } from "../../Motion/WallCollisionResolver.js";
import { massFromBody } from "../../Motion/bodyMass.js";
import { applyActorPushTipImpulse } from "../../Props/actorPushTip.js";
import { wakePushableBody } from "../../Motion/pushableSleep.js";
import { shouldResolveActorPushable } from "./entityBroadphase.js";
import { resolveCirclePair } from "./circlePair.js";
import { circlesOverlap, findFirstCircleSegmentHit } from "./overlap.js";
import { resolveSatPair } from "./satPair.js";
function resolveActorPushable(actor, pickup, resolveWalls, spatialFrame, state) {
    if (!shouldResolveActorPushable(actor, pickup)) return;
    const { mass, restitution } = getCollisionSettings();
    const collisionInfo = resolveSatPair(actor, actor.getShape(), pickup, pickup.getShape(), {
        massA: actor.mass !== undefined ? actor.mass : actor.radius,
        massB: pickup.mass !== undefined ? pickup.mass : mass.pickupFallback,
        restitution: restitution.actorPushable,
    });
    if (!collisionInfo) return;
    applyActorPushTipImpulse(actor, pickup, collisionInfo, state);
    invalidateWallResolveCache(actor, pickup);
    wakePushableBody(pickup);
    resolveWalls(actor, spatialFrame);
    resolveWalls(pickup, spatialFrame);
}
function pushablePairRestitution(p1, p2) {
    const r1 = p1.strategy?.pairRestitution;
    const r2 = p2.strategy?.pairRestitution;
    if (r1 != null && r2 != null) return (r1 + r2) * 0.5;
    return r1 ?? r2 ?? getCollisionSettings().restitution.pushablePair;
}
function resolvePushablePair(p1, p2) {
    const shapeA = p1.getShape();
    const shapeB = p2.getShape();
    const restitution = pushablePairRestitution(p1, p2);
    if (shapeA.type === "Circle" && shapeB.type === "Circle") {
        if (resolveCirclePair(p1, p2, { restitution })) {
            invalidateWallResolveCache(p1, p2);
            wakePushableBody(p1);
            wakePushableBody(p2);
        }
        return;
    }
    const collisionInfo = resolveSatPair(p1, shapeA, p2, shapeB, { massA: massFromBody(p1), massB: massFromBody(p2), restitution });
    if (!collisionInfo) return;
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
 *   projectilePickupFilter: { allows: (a: object, b: object) => boolean },
 *   onProjectileWallHit: (projectile: object, segment: object, events: object[]) => void,
 *   onProjectilePickupHit: (projectile: object, pickup: object, events: object[]) => boolean,
 *   onProjectileFactionCollisions: (projectile: object, events: object[]) => void,
 *   resolveWalls: (entity: object, spatialFrame: object) => void,
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
        projectilePickupFilter,
        onProjectileWallHit,
        onProjectilePickupHit,
        onProjectileFactionCollisions,
        resolveWalls,
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
            let hitPickup = false;
            spatialFrame.forEachNeighbor(p, (pickup) => {
                if (hitPickup || !projectilePickupFilter.allows(p, pickup)) return;
                if (!circlesOverlap(p, pickup)) return;
                if (onProjectilePickupHit(p, pickup, out)) hitPickup = true;
            });
            if (hitPickup) continue;
            onProjectileFactionCollisions(p, out);
        }
    const pushables = spatialFrame._pushables;
    const combatants = spatialFrame._combatants;
    const hasPushables = pushables && pushables.length > 0;
    const hasCombatants = combatants && combatants.length > 0;
    if (hasPushables || hasCombatants)
        for (let iter = 0; iter < pushableIterations; iter++) {
            if (hasCombatants && spatialFrame.forEachActorPushablePair)
                spatialFrame.forEachActorPushablePair((actor, pickup) => resolveActorPushable(actor, pickup, resolveWalls, spatialFrame, state));
            if (hasPushables) {
                spatialFrame.forEachPushablePair((p1, p2) => resolvePushablePair(p1, p2));
                for (let i = 0; i < pushables.length; i++) {
                    const pickup = pushables[i];
                    if (pickup.isDead || !pickup.needsWallCollision()) continue;
                    resolveWalls(pickup, spatialFrame);
                }
            }
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
