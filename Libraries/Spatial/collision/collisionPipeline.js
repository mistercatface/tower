import { invalidateWallResolveCache } from "../../Motion/WallCollisionResolver.js";
import { wakePushableBody } from "../../Motion/pushableSleep.js";
import { shouldResolveActorPushable } from "./entityBroadphase.js";
import { resolveCirclePair } from "./circlePair.js";
import { circlesOverlap, findFirstCircleSegmentHit } from "./overlap.js";
import { resolveSatPair } from "./satPair.js";

const DEFAULT_PUSHABLE_ITERATIONS = 4;

function resolveActorPushable(actor, pickup, resolveWalls, spatialFrame) {
    if (!shouldResolveActorPushable(actor, pickup)) return;
    const collisionInfo = resolveSatPair(actor, actor.getShape(), pickup, pickup.getShape(), {
        massA: actor.mass !== undefined ? actor.mass : actor.radius,
        massB: pickup.mass !== undefined ? pickup.mass : 1.0,
        restitution: 0.15,
    });
    if (!collisionInfo) return;
    invalidateWallResolveCache(actor, pickup);
    wakePushableBody(pickup);
    resolveWalls(actor, spatialFrame);
    resolveWalls(pickup, spatialFrame);
}

function resolvePushablePair(p1, p2) {
    const collisionInfo = resolveSatPair(p1, p1.getShape(), p2, p2.getShape(), { massA: p1.mass !== undefined ? p1.mass : 15.0, massB: p2.mass !== undefined ? p2.mass : 15.0, restitution: 0.4 });
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
        combatantRestitution = () => 0.15,
        onChargeImpact = null,
        pushableIterations = DEFAULT_PUSHABLE_ITERATIONS,
    },
) {
    const events = [];
    for (let i = 0; i < projectiles.length; i++) {
        const p = projectiles[i];
        if (p.isDead) continue;
        const wallCandidates = spatialFrame.getWallCandidates(p);
        const segment = findFirstCircleSegmentHit(p, wallCandidates);
        if (segment) {
            onProjectileWallHit(p, segment, events);
            continue;
        }
        let hitPickup = false;
        spatialFrame.forEachNeighbor(p, (pickup) => {
            if (hitPickup || !projectilePickupFilter.allows(p, pickup)) return;
            if (!circlesOverlap(p, pickup)) return;
            if (onProjectilePickupHit(p, pickup, events)) hitPickup = true;
        });
        if (hitPickup) continue;
        onProjectileFactionCollisions(p, events);
    }

    for (let iter = 0; iter < pushableIterations; iter++) {
        spatialFrame.forEachActorPushablePair((actor, pickup) => resolveActorPushable(actor, pickup, resolveWalls, spatialFrame));
        spatialFrame.forEachPushablePair((p1, p2) => resolvePushablePair(p1, p2));
        const pushables = spatialFrame._pushables;
        if (pushables) {
            for (let i = 0; i < pushables.length; i++) {
                const pickup = pushables[i];
                if (pickup.isDead || !pickup.needsWallCollision()) continue;
                resolveWalls(pickup, spatialFrame);
            }
        }
    }

    spatialFrame.forEachCombatantPair((a, b) => {
        if (!circlesOverlap(a, b)) return;
        const restitution = combatantRestitution(a, b);
        if (resolveCirclePair(a, b, { restitution })) invalidateWallResolveCache(a, b);
        if (onChargeImpact) {
            if (a.attackType === "charge" && a.currentStateName !== "stunned") {
                onChargeImpact(a, b, events);
            }
            if (b.attackType === "charge" && b.currentStateName !== "stunned") {
                onChargeImpact(b, a, events);
            }
        }
    });

    return events;
}
