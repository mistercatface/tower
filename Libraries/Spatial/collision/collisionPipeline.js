import { getCollisionSettings } from "../../../Core/GameCollisionSettings.js";
import { distanceSqToSegment } from "../geometry/WallGeometry.js";
import { gatherKineticConstraintSlab, measureConstraintSlabMaxError, resolveGatheredKineticConstraintSlab } from "../../Motion/kineticConstraintSolver.js";
import { maxActiveKineticSpeedSq } from "../../Motion/motionSubsteps.js";
import { ensureKineticContactPairs, resolveKineticContactPassWithPairs, kineticContactBuffer } from "./kineticContactSolver.js";
import { applyKineticContactSideEffects } from "./kineticContactSideEffects.js";
import { snapshotActiveBroadphaseBounds } from "./entityBroadphase.js";
import { activeBodiesMatchKineticSlab, kineticBodySlab } from "./kineticBodySlab.js";
import { persistedKineticPairBuffer } from "./kineticPairStream.js";
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
 * @param {{ frame: object, world: object }} tick
 * @param {{
 *   resolveWalls: (entity: object) => void,
 *   kineticIterations?: number,
 *   applyContactSideEffects?: (tick: object, contacts: object) => void,
 * }} hooks
 */
export function runCollisionPipeline(
    tick,
    { resolveWalls, kineticIterations = getCollisionSettings().kineticIterations, applyContactSideEffects = (t, contacts) => applyKineticContactSideEffects(t, contacts) } = {},
) {
    const frame = tick.frame;
    const { velocityEpsilonSq, constraintErrorEpsilon } = getCollisionSettings().kineticEarlyOut;
    const activeBodies = frame._activeKineticBodies;
    const hasActiveBodies = activeBodies.length > 0;
    if (hasActiveBodies)
        for (let i = 0; i < activeBodies.length; i++) {
            const prop = activeBodies[i];
            prop._frameDispX = prop.x - (prop._wallDispPrevX ?? prop.x);
            prop._frameDispY = prop.y - (prop._wallDispPrevY ?? prop.y);
        }
    let outerIterationsRun = 0;
    if (hasActiveBodies) {
        gatherKineticConstraintSlab(tick);
        ensureKineticContactPairs(tick, persistedKineticPairBuffer);
        const patchBodies = tick.world.kinetic.substepPairPatchBodies ?? (tick.world.kinetic.substepPairPatchBodies = []);
        for (let iter = 0; iter < kineticIterations; iter++) {
            outerIterationsRun = iter + 1;
            resolveKineticContactPassWithPairs(tick, persistedKineticPairBuffer);
            applyContactSideEffects(tick, kineticContactBuffer);
            resolveGatheredKineticConstraintSlab(tick);
            for (let i = 0; i < activeBodies.length; i++) {
                const prop = activeBodies[i];
                if (!prop.strategy?.isKinetic) continue;
                const wallCandidates = frame.getWallCandidates(prop);
                if (!prop.needsWallCollision() && !kineticOverlapsWallSegment(prop, wallCandidates)) continue;
                resolveWalls(prop);
            }
            frame.flushScheduledKineticActivations(patchBodies);
            const MAX_KINETIC_SPEED = 1000;
            const MAX_KINETIC_SPEED_SQ = MAX_KINETIC_SPEED * MAX_KINETIC_SPEED;
            for (let i = 0; i < activeBodies.length; i++) {
                const body = activeBodies[i];
                const vx = body.vx ?? 0;
                const vy = body.vy ?? 0;
                const speedSq = vx * vx + vy * vy;
                if (speedSq > MAX_KINETIC_SPEED_SQ) {
                    const speed = Math.sqrt(speedSq);
                    body.vx = (vx / speed) * MAX_KINETIC_SPEED;
                    body.vy = (vy / speed) * MAX_KINETIC_SPEED;
                }
                const physId = body._physId;
                if (physId !== undefined && physId !== -1) {
                    const svx = kineticBodySlab.vx[physId];
                    const svy = kineticBodySlab.vy[physId];
                    const sSpeedSq = svx * svx + svy * svy;
                    if (sSpeedSq > MAX_KINETIC_SPEED_SQ) {
                        const sSpeed = Math.sqrt(sSpeedSq);
                        kineticBodySlab.vx[physId] = (svx / sSpeed) * MAX_KINETIC_SPEED;
                        kineticBodySlab.vy[physId] = (svy / sSpeed) * MAX_KINETIC_SPEED;
                    }
                }
            }
            if (!activeBodiesMatchKineticSlab(activeBodies)) continue;
            snapshotActiveBroadphaseBounds(activeBodies);
            const maxError = measureConstraintSlabMaxError();
            const maxSpeedSq = maxActiveKineticSpeedSq(activeBodies);
            if (maxError <= constraintErrorEpsilon && maxSpeedSq <= velocityEpsilonSq) break;
        }
        tick.world.kinetic.kineticSolverStats = { outerIterations: outerIterationsRun, maxIterations: kineticIterations };
    } else tick.world.kinetic.kineticSolverStats = { outerIterations: 0, maxIterations: kineticIterations };
    if (hasActiveBodies)
        for (let i = 0; i < activeBodies.length; i++) {
            const prop = activeBodies[i];
            prop._wallDispPrevX = prop.x;
            prop._wallDispPrevY = prop.y;
        }
}
