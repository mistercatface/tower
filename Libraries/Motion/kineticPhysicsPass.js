import { collisionSettings } from "../Collision/collisionDefaults.js";
import { runCollisionPipeline } from "../Spatial/collision/collisionPipeline.js";
import { advanceKineticSleep, evaluateKineticIslandSleepEligible } from "./kineticSleep.js";
import { ensureKineticIslandPlan } from "./kineticIslands.js";
import { applyGroundRollDrive } from "../Sandbox/kineticRollActuator.js";
import { wakeKineticBody } from "./kineticSleep.js";
import { countMotionSubsteps, maxActiveKineticSpeedSq } from "./motionSubsteps.js";
function propBlocksSleep(prop) {
    const fn = prop.currentState?.blocksSleep;
    if (fn) return fn.call(prop.currentState);
    return false;
}
function tickKineticSleep(frame) {
    const kineticBodies = frame._kineticBodies;
    if (!kineticBodies) return;
    for (let i = 0; i < kineticBodies.length; i++) {
        const prop = kineticBodies[i];
        const root = prop._kineticIslandRoot ?? prop.id;
        if (prop.id !== root) continue;
        const islandMembers = prop._kineticIslandPeers ?? [prop];
        const eligible = evaluateKineticIslandSleepEligible(islandMembers, frame, { blocksSleep: propBlocksSleep });
        for (let j = 0; j < islandMembers.length; j++) advanceKineticSleep(islandMembers[j], eligible);
    }
}
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
    tickKineticSleep(frame);
    frame.syncActiveKineticBodies();
    world.sandbox?.simulationFrameHooks?.afterPhysics?.(world);
    hooks.afterKineticPhysics?.(tick);
}
