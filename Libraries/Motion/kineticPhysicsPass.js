import { collisionSettings } from "./collisionDefaults.js";
import { runCollisionPipeline } from "../Spatial/collision/collisionPipeline.js";
import { advanceKineticSleepIslands, wakeKineticBody } from "./kineticSleep.js";
import { ensureKineticIslandPlan } from "./kineticIslands.js";
import { applyGroundRollDrive } from "../Sandbox/kineticRollActuator.js";
import { countMotionSubsteps, maxActiveKineticSpeedSq } from "./motionSubsteps.js";
export function runKineticPhysics(tick, dt, hooks) {
    const world = tick.world;
    world.sandbox?.simulationFrameHooks?.beforePhysics?.(world);
    const frame = tick.frame;
    const session = world.kinetic;
    ensureKineticIslandPlan(session, frame._kineticBodies);
    session.kineticConstraintsDirty = false;
    session.substepPairsValid = false;
    session.substepPairPatchBodies = session.substepPairPatchBodies ?? [];
    session.substepPairPatchBodies.length = 0;
    session.kineticPairGatherStats = { full: 0, refresh: 0, patch: 0 };
    const kineticBodies = frame._kineticBodies;
    for (let i = 0; i < kineticBodies.length; i++) if (kineticBodies[i]._groundRollDrive) wakeKineticBody(kineticBodies[i]);
    frame.syncActiveKineticBodies();
    const activeBodies = frame._activeKineticBodies;
    const { maxStepPx, maxSubsteps } = collisionSettings.motionSubsteps;
    const steps = countMotionSubsteps(dt, activeBodies, { maxStepPx, maxSubsteps });
    const subDt = dt / steps;
    const subDtSec = subDt / 1000;
    const { velocityEpsilonSq } = collisionSettings.kineticEarlyOut;
    let substepsRun = steps;
    for (let s = 0; s < steps; s++) {
        for (let i = 0; i < activeBodies.length; i++) applyGroundRollDrive(activeBodies[i], subDtSec, world);
        for (let i = world.worldProps.length - 1; i >= 0; i--) hooks.updateProp(world.worldProps[i], subDt, frame);
        const projectiles = world.projectiles || [];
        for (let i = projectiles.length - 1; i >= 0; i--) hooks.updateProp(projectiles[i], subDt, frame);
        frame.reindexKineticBodies(activeBodies);
        runCollisionPipeline(tick, { resolveWalls: (entity) => hooks.resolveWalls(entity, frame), applyContactSideEffects: hooks.applyContactSideEffects });
        const maxSpeedSq = maxActiveKineticSpeedSq(activeBodies);
        const solverStats = world.kinetic.kineticSolverStats;
        const constraintsStable = !solverStats || solverStats.outerIterations < collisionSettings.kineticConstraints.iterations;
        if (s + 1 < steps && maxSpeedSq <= velocityEpsilonSq && constraintsStable) {
            substepsRun = s + 1;
            break;
        }
    }
    session.motionSubstepStats = { substepsRun, substepsPlanned: steps };
    advanceKineticSleepIslands(frame, session);
    frame.syncActiveKineticBodies();
    world.sandbox?.simulationFrameHooks?.afterPhysics?.(world);
    hooks.afterKineticPhysics?.(tick);
}
