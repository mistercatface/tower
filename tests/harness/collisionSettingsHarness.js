import { collisionSettings, LIBRARY_COLLISION_DEFAULTS } from "../../Libraries/Motion/collisionDefaults.js";
import { mergeObjectTree, replaceRecordContents } from "../../Libraries/Config/mergeConfig.js";

export const COLLISION_NO_EARLY_OUT = { velocityEpsilonSq: -1, constraintErrorEpsilon: -1, contactImpulseEpsilon: -1 };

export function collisionSettingsForIterations(kineticIterations) {
    return { kineticIterations, kineticEarlyOut: COLLISION_NO_EARLY_OUT };
}

export function withCollisionSettings(overrides, fn) {
    const prev = structuredClone(collisionSettings);
    replaceRecordContents(collisionSettings, mergeObjectTree(LIBRARY_COLLISION_DEFAULTS, overrides));
    try {
        return fn();
    } finally {
        replaceRecordContents(collisionSettings, prev);
    }
}
