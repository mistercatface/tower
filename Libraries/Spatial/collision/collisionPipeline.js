import { getCollisionSettings } from "../../../Core/GameCollisionSettings.js";
import { distanceSqToSegment } from "../geometry/WallGeometry.js";
import { gatherKineticConstraintBuffer, measureConstraintBufferMaxError, projectKineticConstraintBuffer, solveKineticConstraintBuffer } from "../../Motion/kineticConstraintSolver.js";
import { gatherKineticContactPairs, resolveKineticContactPass, resolveKineticContactPassWithPairs } from "./kineticContactSolver.js";
import { snapshotActiveBroadphaseBounds } from "./entityBroadphase.js";
import { activeBodiesMatchKineticSlab } from "./kineticBodySlab.js";
import { copyKineticPairBuffer, kineticPairBuffer, persistedKineticPairBuffer } from "./kineticPairStream.js";
import { SatCollision, getEntityCollisionParts } from "./SatCollision.js";
import { ensureWallSegmentPolygonShape } from "./wallResolution.js";
function maxActiveKineticSpeedSq(activeBodies) {
    let max = 0;
    for (let i = 0; i < activeBodies.length; i++) {
        const prop = activeBodies[i];
        const vx = prop.vx ?? 0;
        const vy = prop.vy ?? 0;
        const sq = vx * vx + vy * vy;
        if (sq > max) max = sq;
    }
    return max;
}
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
    const earlyOut = getCollisionSettings().kineticEarlyOut;
    const activeBodies = spatialFrame._activeKineticBodies;
    const hasActiveBodies = activeBodies.length > 0;
    if (hasActiveBodies)
        for (let i = 0; i < activeBodies.length; i++) {
            const prop = activeBodies[i];
            prop._frameDispX = prop.x - (prop._wallDispPrevX ?? prop.x);
            prop._frameDispY = prop.y - (prop._wallDispPrevY ?? prop.y);
        }
    let outerIterationsRun = 0;
    if (hasActiveBodies) {
        const { buffer: constraintBuffer, groups: constraintGroups } = gatherKineticConstraintBuffer(state);
        let persistedPairs = null;
        for (let iter = 0; iter < kineticIterations; iter++) {
            outerIterationsRun = iter + 1;
            if (earlyOut.persistPairs) {
                if (iter === 0) {
                    gatherKineticContactPairs(spatialFrame);
                    copyKineticPairBuffer(kineticPairBuffer, persistedKineticPairBuffer);
                    persistedPairs = persistedKineticPairBuffer;
                }
                resolveKineticContactPassWithPairs(spatialFrame, state, persistedPairs);
            } else resolveKineticContactPass(spatialFrame, state);
            projectKineticConstraintBuffer(constraintBuffer, constraintGroups);
            solveKineticConstraintBuffer(spatialFrame, constraintBuffer, constraintGroups);
            for (let i = 0; i < activeBodies.length; i++) {
                const prop = activeBodies[i];
                if (!prop.strategy?.isKinetic) continue;
                const wallCandidates = spatialFrame.getWallCandidates(prop);
                if (!prop.needsWallCollision() && !kineticOverlapsWallSegment(prop, wallCandidates)) continue;
                resolveWalls(prop, spatialFrame);
            }
            spatialFrame.flushScheduledKineticActivations();
            if (earlyOut.enabled && outerIterationsRun >= earlyOut.minIterations) {
                if (!activeBodiesMatchKineticSlab(activeBodies)) continue;
                snapshotActiveBroadphaseBounds(activeBodies);
                const maxError = measureConstraintBufferMaxError(constraintBuffer);
                const maxSpeedSq = maxActiveKineticSpeedSq(activeBodies);
                if (maxError <= earlyOut.constraintErrorEpsilon && maxSpeedSq <= earlyOut.velocityEpsilonSq) break;
            }
        }
        state.sandbox.kineticSolverStats = { outerIterations: outerIterationsRun, maxIterations: kineticIterations };
    }
    if (hasActiveBodies)
        for (let i = 0; i < activeBodies.length; i++) {
            const prop = activeBodies[i];
            prop._wallDispPrevX = prop.x;
            prop._wallDispPrevY = prop.y;
        }
}
