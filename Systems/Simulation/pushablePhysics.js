import { CollisionSystem } from "../Collision/CollisionSystem.js";
import { integrateLongAxisLogFacing, runPushablePhysicsPass } from "../../Libraries/Motion/pushablePhysicsPass.js";
function updatePickups(state, dt, spatialFrame, { resolveWalls = false } = {}) {
    for (let i = state.pickups.length - 1; i >= 0; i--) {
        const p = state.pickups[i];
        p.update(dt, state, spatialFrame, { resolveWalls });
        if (p.isDead) state.pickups.splice(i, 1);
    }
}
export function runPushablePhysics(state, dt, spatialFrame, events) {
    return runPushablePhysicsPass(
        state,
        dt,
        spatialFrame,
        {
            updatePickups,
            runCollisions: (s, frame, buffer) => CollisionSystem.run(s, frame, buffer),
            afterCollisions: integrateLongAxisLogFacing,
            blocksSleep: (pickup) => pickup.currentState?.blocksSleep?.() ?? false,
        },
        events,
    );
}
