import { collisionSettings } from "../../Collision/collisionDefaults.js";
import { gatherKineticConstraintSlab, measureConstraintSlabMaxError, resolveGatheredKineticConstraintSlab } from "../../Motion/kineticConstraintSolver.js";
import { maxActiveKineticSpeedSq } from "../../Motion/motionSubsteps.js";
import { ensureKineticContactPairs, resolveKineticContactPassWithPairs, kineticContactBuffer, sleepContactBuffer } from "./kineticContactSolver.js";
import { applyKineticContactSideEffects } from "./kineticContactSideEffects.js";
import { refreshActiveKineticBodySlabPose } from "./entityBroadphase.js";
import { clampActiveKineticBodySlabSpeed, writebackActiveKineticBodySlab } from "./kineticBodySlab.js";
import { persistedKineticPairBuffer } from "./kineticPairStream.js";
import { shouldResolveKineticBodyAgainstWalls } from "./wallResolution.js";
function resolveActiveBodyWalls(activeBodies, frame, resolveWalls) {
    for (let i = 0; i < activeBodies.length; i++) {
        const prop = activeBodies[i];
        const wallCandidates = frame.getWallCandidates(prop);
        if (!shouldResolveKineticBodyAgainstWalls(prop, wallCandidates)) continue;
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
            prop._wallResolveHits = null;
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
            const maxError = measureConstraintSlabMaxError();
            const maxSpeedSq = maxActiveKineticSpeedSq(activeBodies);
            const settled = maxError <= constraintErrorEpsilon && maxSpeedSq <= velocityEpsilonSq;
            if (!settled || iter === 0) resolveActiveBodyWalls(activeBodies, frame, resolveWalls);
            frame.flushScheduledKineticActivations(patchBodies);
            clampActiveKineticBodySlabSpeed(1000);
            if (settled) break;
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
