import { getCollisionSettings } from "../../Collision/collisionDefaults.js";
import { distanceSqToSegment } from "../geometry/WallGeometry.js";
import { gatherKineticConstraintSlab, measureConstraintSlabMaxError, resolveGatheredKineticConstraintSlab } from "../../Motion/kineticConstraintSolver.js";
import { maxActiveKineticSpeedSq } from "../../Motion/motionSubsteps.js";
import { ensureKineticContactPairs, resolveKineticContactPassWithPairs, kineticContactBuffer } from "./kineticContactSolver.js";
import { applyKineticContactSideEffects } from "./kineticContactSideEffects.js";
import { refreshActiveKineticBodySlabPose } from "./entityBroadphase.js";
import { clampActiveKineticBodySlabSpeed, writebackActiveKineticBodySlab } from "./kineticBodySlab.js";
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
function bridgeActiveBodiesThroughLegacyWalls(activeBodies, frame, resolveWalls) {
    writebackActiveKineticBodySlab(activeBodies);
    for (let i = 0; i < activeBodies.length; i++) {
        const prop = activeBodies[i];
        if (!prop.strategy?.isKinetic) continue;
        const wallCandidates = frame.getWallCandidates(prop);
        if (!prop.needsWallCollision() && !kineticOverlapsWallSegment(prop, wallCandidates)) continue;
        resolveWalls(prop);
    }
    refreshActiveKineticBodySlabPose(activeBodies);
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
            bridgeActiveBodiesThroughLegacyWalls(activeBodies, frame, resolveWalls);
            frame.flushScheduledKineticActivations(patchBodies);
            clampActiveKineticBodySlabSpeed(1000);
            writebackActiveKineticBodySlab(activeBodies);
            refreshActiveKineticBodySlabPose(activeBodies);
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
