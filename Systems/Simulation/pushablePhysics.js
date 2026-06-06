import { ProgressionManager } from "../../Progression/ProgressionManager.js";
import { CollisionSystem } from "../Collision/CollisionSystem.js";
import { integrateLongAxisLogFacing, runPushablePhysicsPass } from "../../Libraries/Motion/pushablePhysicsPass.js";

export function runPushablePhysics(state, dt, spatialFrame, events) {
    return runPushablePhysicsPass(
        state,
        dt,
        spatialFrame,
        {
            updatePickups: ProgressionManager.updatePickups,
            runCollisions: (s, frame, buffer) => CollisionSystem.run(s, frame, buffer),
            afterCollisions: integrateLongAxisLogFacing,
            blocksSleep: (pickup) => pickup.currentState?.blocksSleep?.() ?? false,
        },
        events,
    );
}