import { removeSandboxWorldProp } from "../Sandbox/sandboxPlacedSpawn.js";
import { getCollisionSettings } from "../../Core/GameCollisionSettings.js";
import { CollisionSystem } from "../../Systems/Collision/CollisionSystem.js";
import { advancePushableSleep, evaluatePushableSleepEligible } from "./pushableSleep.js";
import { countMotionSubsteps } from "./motionSubsteps.js";
import { integrateStandTipsAfterCollisions } from "../Props/standTipMotion.js";
function propBlocksSleep(prop) {
    const fn = prop.currentState.blocksSleep;
    if (fn) return fn.call(prop.currentState);
    return false;
}
function tickPushableSleep(spatialFrame) {
    const pushables = spatialFrame._pushables;
    if (!pushables) return;
    for (let i = 0; i < pushables.length; i++) {
        const prop = pushables[i];
        if (prop.isDead) continue;
        const eligible = evaluatePushableSleepEligible(prop, spatialFrame.getNeighbors(prop), { blocksSleep: propBlocksSleep });
        advancePushableSleep(prop, eligible);
    }
}
/** World prop update → collision substeps → stand tips → roll facing → sleep. */
export function runPushablePhysics(state, dt, spatialFrame, events) {
    const pushables = spatialFrame._pushables;
    const { maxStepPx, maxSubsteps } = getCollisionSettings().motionSubsteps;
    const steps = countMotionSubsteps(dt, pushables, { maxStepPx, maxSubsteps });
    const subDt = dt / steps;
    for (let s = 0; s < steps; s++) {
        for (let i = state.worldProps.length - 1; i >= 0; i--) {
            const p = state.worldProps[i];
            p.update(subDt, state, spatialFrame);
            if (p.isDead) removeSandboxWorldProp(state, p);
        }
        spatialFrame.reindexPushables(pushables);
        CollisionSystem.run(state, spatialFrame, events);
    }
    integrateStandTipsAfterCollisions(state, dt);
    integrateLongAxisLogFacing(state, dt);
    tickPushableSleep(spatialFrame);
}
/** In-plane spin about center: collision ω_z → facing (same frame, separate from 3D tumble). */
export function integrateLongAxisLogFacing(state, dt) {
    for (let i = 0; i < state.worldProps.length; i++) {
        const prop = state.worldProps[i];
        if (prop.isDead || prop.isSleeping) continue;
        if (prop.strategy.rollAxis !== "long" && !prop.strategy.standTip) continue;
        const w = prop.angularVelocity ?? 0;
        if (Math.abs(w) < 0.02) continue;
        prop.facing = (prop.facing ?? 0) + w * (dt / 1000);
    }
}
