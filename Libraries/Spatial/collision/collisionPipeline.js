import { collisionSettings } from "../../Collision/collisionDefaults.js";
import { distanceSqToSegment } from "../geometry/WallGeometry.js";
import { gatherKineticConstraintSlab, measureConstraintSlabMaxError, resolveGatheredKineticConstraintSlab } from "../../Motion/kineticConstraintSolver.js";
import { maxActiveKineticSpeedSq } from "../../Motion/motionSubsteps.js";
import { ensureKineticContactPairs, resolveKineticContactPassWithPairs, kineticContactBuffer, sleepContactBuffer } from "./kineticContactSolver.js";
import { applyKineticContactSideEffects } from "./kineticContactSideEffects.js";
import { refreshActiveKineticBodySlabPose } from "./entityBroadphase.js";
import { clampActiveKineticBodySlabSpeed, writebackActiveKineticBodySlab, kineticDynamicSlab } from "./kineticBodySlab.js";
import { persistedKineticPairBuffer } from "./kineticPairStream.js";
import { SatCollision, SAT_RESULT, getEntityCollisionParts, entityFacing } from "./SatCollision.js";
import { ensureWallSegmentPolygonShape } from "./wallResolution.js";
/** @param {object} prop @param {object[]} wallCandidates */
function kineticOverlapsWallSegment(prop, wallCandidates) {
    const parts = getEntityCollisionParts(prop);
    const physId = prop._physId;
    const hasSlab = physId !== undefined && physId !== -1;
    const px = hasSlab ? kineticDynamicSlab.x[physId] : prop.x;
    const py = hasSlab ? kineticDynamicSlab.y[physId] : prop.y;
    for (let p = 0; p < parts.length; p++) {
        const shape = parts[p];
        if (shape.type === "Circle") {
            const radiusSq = shape.radius * shape.radius;
            for (let i = 0; i < wallCandidates.length; i++) {
                const seg = wallCandidates[i];
                if (distanceSqToSegment(seg, px, py) <= radiusSq) return true;
            }
            continue;
        }
        for (let i = 0; i < wallCandidates.length; i++) {
            const seg = wallCandidates[i];
            const segShape = ensureWallSegmentPolygonShape(seg);
            if (SAT_RESULT[0] !== undefined) {
                // SAT_RESULT logic
            }
            if (SatCollision.checkCollision(px, py, entityFacing(prop), shape, seg.x, seg.y, entityFacing(seg), segShape)) return true;
        }
    }
    return false;
}
function bridgeActiveBodiesThroughLegacyWalls(activeBodies, frame, resolveWalls) {
    for (let i = 0; i < activeBodies.length; i++) {
        const prop = activeBodies[i];
        if (!prop.strategy?.isKinetic) continue;
        const wallCandidates = frame.getWallCandidates(prop);
        if (!prop.needsWallCollision() && !kineticOverlapsWallSegment(prop, wallCandidates)) continue;
        resolveWalls(prop);
    }
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
    { resolveWalls, kineticIterations = collisionSettings.kineticIterations, applyContactSideEffects = (t, contacts) => applyKineticContactSideEffects(t, contacts) } = {},
) {
    const frame = tick.frame;
    const { velocityEpsilonSq, constraintErrorEpsilon } = collisionSettings.kineticEarlyOut;
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
        sleepContactBuffer.reset();
        gatherKineticConstraintSlab(tick);
        ensureKineticContactPairs(tick, persistedKineticPairBuffer);
        const patchBodies = tick.world.kinetic.substepPairPatchBodies ?? (tick.world.kinetic.substepPairPatchBodies = []);
        for (let iter = 0; iter < kineticIterations; iter++) {
            outerIterationsRun = iter + 1;
            resolveKineticContactPassWithPairs(tick, persistedKineticPairBuffer);
            applyContactSideEffects(tick, kineticContactBuffer);
            resolveGatheredKineticConstraintSlab(tick);
            bridgeActiveBodiesThroughLegacyWalls(activeBodies, frame, resolveWalls);
            frame.flushScheduledKineticActivations(patchBodies);
            clampActiveKineticBodySlabSpeed(1000);
            const maxError = measureConstraintSlabMaxError();
            const maxSpeedSq = maxActiveKineticSpeedSq(activeBodies);
            if (maxError <= constraintErrorEpsilon && maxSpeedSq <= velocityEpsilonSq) break;
        }
        writebackActiveKineticBodySlab(activeBodies);
        refreshActiveKineticBodySlabPose(activeBodies);
        tick.world.kinetic.kineticSolverStats = { outerIterations: outerIterationsRun, maxIterations: kineticIterations };
    } else tick.world.kinetic.kineticSolverStats = { outerIterations: 0, maxIterations: kineticIterations };
    if (hasActiveBodies)
        for (let i = 0; i < activeBodies.length; i++) {
            const prop = activeBodies[i];
            prop._wallDispPrevX = prop.x;
            prop._wallDispPrevY = prop.y;
        }
}
