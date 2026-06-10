import { getCollisionSettings } from "../../Core/GameCollisionSettings.js";
import { CollisionSystem } from "../../Systems/Collision/CollisionSystem.js";
import { advancePushableSleep, evaluatePushableSleepEligible } from "./pushableSleep.js";
import { countMotionSubsteps } from "./motionSubsteps.js";
import { integrateStandTipsAfterCollisions } from "../Props/standTipMotion.js";
function pickupBlocksSleep(pickup) {
    const fn = pickup.currentState.blocksSleep;
    if (fn) return fn.call(pickup.currentState);
    return false;
}
function tickPushableSleep(spatialFrame) {
    const pushables = spatialFrame._pushables;
    if (!pushables) return;
    for (let i = 0; i < pushables.length; i++) {
        const pickup = pushables[i];
        if (pickup.isDead) continue;
        const eligible = evaluatePushableSleepEligible(pickup, spatialFrame.getNeighbors(pickup), { blocksSleep: pickupBlocksSleep });
        advancePushableSleep(pickup, eligible);
    }
}
/** Pickup update → collision substeps → stand tips → roll facing → sleep. */
export function runPushablePhysics(state, dt, spatialFrame, events) {
    const pushables = spatialFrame._pushables;
    const { maxStepPx, maxSubsteps } = getCollisionSettings().motionSubsteps;
    const steps = countMotionSubsteps(dt, pushables, { maxStepPx, maxSubsteps });
    const subDt = dt / steps;
    for (let s = 0; s < steps; s++) {
        for (let i = state.pickups.length - 1; i >= 0; i--) {
            const p = state.pickups[i];
            p.update(subDt, state, spatialFrame);
            if (p.isDead) state.pickups.splice(i, 1);
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
    for (let i = 0; i < state.pickups.length; i++) {
        const pickup = state.pickups[i];
        if (pickup.isDead || pickup.isSleeping) continue;
        if (pickup.strategy.rollAxis !== "long" && !pickup.strategy.standTip) continue;
        const w = pickup.angularVelocity ?? 0;
        if (Math.abs(w) < 0.02) continue;
        pickup.facing = (pickup.facing ?? 0) + w * (dt / 1000);
    }
}
