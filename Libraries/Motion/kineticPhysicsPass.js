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
function tickKineticSleep(spatialFrame) {
    const kineticBodies = spatialFrame._kineticBodies;
    if (!kineticBodies) return;
    const visited = new Set();
    for (let i = 0; i < kineticBodies.length; i++) {
        const prop = kineticBodies[i];
        const root = prop._kineticIslandRoot ?? prop.id;
        if (visited.has(root)) continue;
        visited.add(root);
        const islandMembers = prop._kineticIslandPeers ?? [prop];
        const eligible = evaluateKineticIslandSleepEligible(islandMembers, spatialFrame, { blocksSleep: propBlocksSleep });
        for (let j = 0; j < islandMembers.length; j++) advanceKineticSleep(islandMembers[j], eligible);
    }
}
/** @param {object} state @param {number} dt @param {object} spatialFrame */
export function runKineticPhysics(state, dt, spatialFrame) {
    ensureKineticIslandPlan(state, spatialFrame._kineticBodies);
    state.sandbox.kineticConstraintsDirty = false;
    const kineticBodies = spatialFrame._kineticBodies;
    for (let i = 0; i < kineticBodies.length; i++) if (kineticBodies[i]._groundRollDrive) wakeKineticBody(kineticBodies[i]);
    spatialFrame.syncActiveKineticBodies();
    const activeBodies = spatialFrame._activeKineticBodies;
    const { maxStepPx, maxSubsteps } = getCollisionSettings().motionSubsteps;
    const steps = countMotionSubsteps(dt, activeBodies, { maxStepPx, maxSubsteps });
    const subDt = dt / steps;
    const subDtSec = subDt / 1000;
    for (let s = 0; s < steps; s++) {
        for (let i = 0; i < activeBodies.length; i++) applyGroundRollDrive(activeBodies[i], subDtSec);
        for (let i = state.worldProps.length - 1; i >= 0; i--) state.worldProps[i].update(subDt, state, spatialFrame);
        spatialFrame.reindexKineticBodies(activeBodies);
        runCollisionPipeline(state, spatialFrame, {
            resolveWalls(entity, frame) {
                state.wallResolver.resolve(entity, frame);
            },
        });
    }
    tickKineticSleep(spatialFrame);
    spatialFrame.syncActiveKineticBodies();
}
