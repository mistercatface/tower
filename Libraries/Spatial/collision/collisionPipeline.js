import { getCollisionSettings } from "../../../Core/GameCollisionSettings.js";
import { distanceSqToSegment } from "../geometry/WallGeometry.js";
import { resolveKineticConstraintPass } from "../../Motion/kineticConstraintSolver.js";
import { resolveKineticContactPass } from "./kineticContactSolver.js";
import { SatCollision, getEntityCollisionParts } from "./SatCollision.js";
import { ensureWallSegmentPolygonShape } from "./wallResolution.js";
/** @param {object} prop @param {object[]} wallCandidates */
function kineticOverlapsWallSegment(prop, wallCandidates) {
    const parts = getEntityCollisionParts(prop);
    for (let p = 0; p < parts.length; p++) {
        const shape = parts[p];
        if (shape.type === "Circle") {
            const radiusSq = shape.radius * shape.radius;
            for (let i = 0; i < wallCandidates.length; i++) {
                const seg = wallCandidates[i];
                if (distanceSqToSegment(seg, prop.x, prop.y) <= radiusSq) return true;
            }
            continue;
        }
        for (let i = 0; i < wallCandidates.length; i++) {
            const seg = wallCandidates[i];
            const segShape = ensureWallSegmentPolygonShape(seg);
            if (SatCollision.checkCollision(prop, shape, seg, segShape)) return true;
        }
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
            resolveKineticConstraintPass(spatialFrame, state);
            for (let i = 0; i < activeBodies.length; i++) {
                const prop = activeBodies[i];
                if (!prop.strategy?.isKinetic) continue;
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
