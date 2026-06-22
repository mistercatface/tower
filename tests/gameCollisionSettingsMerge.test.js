import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyGameCollisionSettings, getCollisionSettings } from "../Core/GameCollisionSettings.js";
import { LIBRARY_COLLISION_DEFAULTS } from "../Libraries/Collision/collisionDefaults.js";
describe("game collision settings merge", () => {
    it("deep-merges nested overrides without dropping sibling defaults", () => {
        applyGameCollisionSettings({ collisionSettings: { kineticConstraints: { iterations: 8 }, kineticEarlyOut: { velocityEpsilonSq: 0.01 } } });
        const settings = getCollisionSettings();
        assert.equal(settings.kineticConstraints.iterations, 8);
        assert.equal(settings.kineticConstraints.velocityBias, LIBRARY_COLLISION_DEFAULTS.kineticConstraints.velocityBias);
        assert.equal(settings.kineticEarlyOut.velocityEpsilonSq, 0.01);
        assert.equal(settings.kineticEarlyOut.constraintErrorEpsilon, LIBRARY_COLLISION_DEFAULTS.kineticEarlyOut.constraintErrorEpsilon);
        assert.equal(settings.kineticEarlyOut.contactImpulseEpsilon, LIBRARY_COLLISION_DEFAULTS.kineticEarlyOut.contactImpulseEpsilon);
        applyGameCollisionSettings(null);
    });
});
