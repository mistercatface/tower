import { collisionSettings, LIBRARY_COLLISION_DEFAULTS } from "../../Libraries/Physics/physics.js";
import { replaceRecordContents } from "../../Libraries/Config/mergeConfig.js";

export const COLLISION_NO_EARLY_OUT = { velocityEpsilonSq: -1, constraintErrorEpsilon: -1, contactImpulseEpsilon: -1 };

export function collisionSettingsForIterations(kineticIterations) {
    return { kineticIterations, kineticEarlyOut: COLLISION_NO_EARLY_OUT };
}

function mergePlainObjectTree(base, overrides) {
    const out = { ...base };
    for (const key of Object.keys(overrides)) {
        const patch = overrides[key];
        const prev = base[key];
        if (patch !== null && typeof patch === "object" && !Array.isArray(patch) && prev !== null && typeof prev === "object" && !Array.isArray(prev)) {
            out[key] = mergePlainObjectTree(prev, patch);
        } else out[key] = patch;
    }
    return out;
}

export function withCollisionSettings(overrides, fn) {
    const prev = structuredClone(collisionSettings);
    replaceRecordContents(collisionSettings, mergePlainObjectTree(LIBRARY_COLLISION_DEFAULTS, overrides));
    try {
        return fn();
    } finally {
        replaceRecordContents(collisionSettings, prev);
    }
}
