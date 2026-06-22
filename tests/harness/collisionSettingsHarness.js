import { applyGameCollisionSettings } from "../../Libraries/Collision/collisionDefaults.js";

export const COLLISION_NO_EARLY_OUT = { velocityEpsilonSq: -1, constraintErrorEpsilon: -1, contactImpulseEpsilon: -1 };

export function collisionSettingsForIterations(kineticIterations) {
    return { kineticIterations, kineticEarlyOut: COLLISION_NO_EARLY_OUT };
}

export function withCollisionSettings(collisionSettings, fn) {
    applyGameCollisionSettings({ collisionSettings });
    try {
        return fn();
    } finally {
        applyGameCollisionSettings(null);
    }
}
