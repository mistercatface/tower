import { getCollisionSettings } from "../../Core/GameCollisionSettings.js";
import { runCollisionPipeline } from "../Spatial/collision/collisionPipeline.js";
import { advanceKineticSleep, evaluateKineticIslandSleepEligible } from "./kineticSleep.js";
import { ensureKineticIslandPlan } from "./kineticIslands.js";
import { applyGroundRollDrive } from "../Sandbox/kineticRollActuator.js";
import { wakeKineticBody } from "./kineticSleep.js";
import { countMotionSubsteps } from "./motionSubsteps.js";
function propBlocksSleep(prop) {
    const fn = prop.currentState.blocksSleep;
    if (fn) return fn.call(prop.currentState);
    return false;
}
function tickKineticSleep(frame) {
    const kineticBodies = frame._kineticBodies;
    if (!kineticBodies) return;
    const visited = new Set();
    for (let i = 0; i < kineticBodies.length; i++) {
        const prop = kineticBodies[i];
        const root = prop._kineticIslandRoot ?? prop.id;
        if (visited.has(root)) continue;
        visited.add(root);
        const islandMembers = prop._kineticIslandPeers ?? [prop];
        const eligible = evaluateKineticIslandSleepEligible(islandMembers, frame, { blocksSleep: propBlocksSleep });
        for (let j = 0; j < islandMembers.length; j++) advanceKineticSleep(islandMembers[j], eligible);
    }
}
export function runKineticPhysics(tick, dt, hooks) {
    const frame = tick.frame;
    const world = tick.world;
    const session = world.kinetic;
    ensureKineticIslandPlan(session, frame._kineticBodies);
    session.kineticConstraintsDirty = false;
    const kineticBodies = frame._kineticBodies;
    for (let i = 0; i < kineticBodies.length; i++) if (kineticBodies[i]._groundRollDrive) wakeKineticBody(kineticBodies[i]);
    frame.syncActiveKineticBodies();
    const activeBodies = frame._activeKineticBodies;
    const { maxStepPx, maxSubsteps } = getCollisionSettings().motionSubsteps;
    const steps = countMotionSubsteps(dt, activeBodies, { maxStepPx, maxSubsteps });
    const subDt = dt / steps;
    const subDtSec = subDt / 1000;
    for (let s = 0; s < steps; s++) {
        for (let i = 0; i < activeBodies.length; i++) applyGroundRollDrive(activeBodies[i], subDtSec);
        for (let i = world.worldProps.length - 1; i >= 0; i--) hooks.updateProp(world.worldProps[i], subDt, frame);
        frame.reindexKineticBodies(activeBodies);
        runCollisionPipeline(tick, { resolveWalls: (entity) => hooks.resolveWalls(entity, frame), applyContactSideEffects: hooks.applyContactSideEffects });
    }
    tickKineticSleep(frame);
    frame.syncActiveKineticBodies();
}
