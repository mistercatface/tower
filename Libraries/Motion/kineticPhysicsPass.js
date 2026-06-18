import { removeSandboxWorldProp } from "../Sandbox/sandboxPlacedSpawn.js";
import { getCollisionSettings } from "../../Core/GameCollisionSettings.js";
import { runCollisionPipeline } from "../Spatial/collision/collisionPipeline.js";
import { advanceKineticSleep, evaluateKineticSleepEligible } from "./kineticSleep.js";
import { countMotionSubsteps } from "./motionSubsteps.js";
function propBlocksSleep(prop) {
    const fn = prop.currentState.blocksSleep;
    if (fn) return fn.call(prop.currentState);
    return false;
}
function tickKineticSleep(spatialFrame) {
    const kineticBodies = spatialFrame._kineticBodies;
    if (!kineticBodies) return;
    for (let i = 0; i < kineticBodies.length; i++) {
        const prop = kineticBodies[i];
        if (prop.isDead) continue;
        const eligible = evaluateKineticSleepEligible(prop, spatialFrame.getNeighbors(prop), { blocksSleep: propBlocksSleep });
        advanceKineticSleep(prop, eligible);
    }
}
/** @param {object} state @param {number} dt @param {object} spatialFrame */
export function runKineticPhysics(state, dt, spatialFrame) {
    spatialFrame.syncActiveKineticBodies();
    const activeBodies = spatialFrame._activeKineticBodies;
    const { maxStepPx, maxSubsteps } = getCollisionSettings().motionSubsteps;
    const steps = countMotionSubsteps(dt, activeBodies, { maxStepPx, maxSubsteps });
    const subDt = dt / steps;
    for (let s = 0; s < steps; s++) {
        for (let i = state.worldProps.length - 1; i >= 0; i--) {
            const p = state.worldProps[i];
            p.update(subDt, state, spatialFrame);
            if (p.isDead) removeSandboxWorldProp(state, p);
        }
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
