import { getCollisionSettings } from "../../../Core/GameCollisionSettings.js";
import { distanceSqToSegment } from "../geometry/WallGeometry.js";
import { findFirstCircleSegmentHit, circlesOverlap } from "./overlap.js";
import { resolvePushableContactPass } from "./pushableContactSolver.js";
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
            resolvePushableContactPass(spatialFrame, state);
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
