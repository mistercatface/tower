import { getCollisionSettings } from "../../../Core/GameCollisionSettings.js";
import { distanceSqToSegment } from "../geometry/WallGeometry.js";
import { resolveKineticContactPass } from "./kineticContactSolver.js";
/** @param {object} prop @param {object[]} wallCandidates */
function kineticOverlapsWallSegment(prop, wallCandidates) {
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
 * Kinetic collision substeps: contact solve + wall resolve.
 *
 * @param {object} state
 * @param {object} spatialFrame
 * @param {{
 *   resolveWalls: (entity: object, spatialFrame: object) => void,
 *   kineticIterations?: number,
 * }} hooks
 */
export function runCollisionPipeline(state, spatialFrame, { resolveWalls, kineticIterations = getCollisionSettings().kineticIterations }) {
    const activeBodies = spatialFrame._activeKineticBodies;
    const hasActiveBodies = activeBodies.length > 0;
    if (hasActiveBodies)
        for (let i = 0; i < activeBodies.length; i++) {
            const prop = activeBodies[i];
            prop._frameDispX = prop.x - (prop._wallDispPrevX ?? prop.x);
            prop._frameDispY = prop.y - (prop._wallDispPrevY ?? prop.y);
        }
    if (hasActiveBodies)
        for (let iter = 0; iter < kineticIterations; iter++) {
            resolveKineticContactPass(spatialFrame, state);
            for (let i = 0; i < activeBodies.length; i++) {
                const prop = activeBodies[i];
                if (prop.isDead || !prop.strategy?.isKinetic) continue;
                const wallCandidates = spatialFrame.getWallCandidates(prop);
                if (!prop.needsWallCollision() && !kineticOverlapsWallSegment(prop, wallCandidates)) continue;
                resolveWalls(prop, spatialFrame);
            }
        }
    if (hasActiveBodies)
        for (let i = 0; i < activeBodies.length; i++) {
            const prop = activeBodies[i];
            prop._wallDispPrevX = prop.x;
            prop._wallDispPrevY = prop.y;
        }
}
