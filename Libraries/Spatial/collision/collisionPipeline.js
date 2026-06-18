import { getCollisionSettings } from "../../../Core/GameCollisionSettings.js";
import { distanceSqToSegment } from "../geometry/WallGeometry.js";
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
 * Pushable collision substeps: contact solve + wall resolve.
 *
 * @param {object} state
 * @param {object} spatialFrame
 * @param {{
 *   resolveWalls: (entity: object, spatialFrame: object) => void,
 *   pushableIterations?: number,
 * }} hooks
 */
export function runCollisionPipeline(state, spatialFrame, { resolveWalls, pushableIterations = getCollisionSettings().pushableIterations }) {
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
}
export function runPushableContactPass(spatialFrame, state) {
    resolvePushableContactPass(spatialFrame, state);
}
