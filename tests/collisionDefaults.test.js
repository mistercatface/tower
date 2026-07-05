import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { collisionSettings, LIBRARY_COLLISION_DEFAULTS } from "../Libraries/Physics/physics.js";
import { withCollisionSettings } from "./harness/collisionSettingsHarness.js";

describe("collision defaults", () => {
    it("deep-merges nested overrides without dropping sibling defaults", () => {
        withCollisionSettings({ kineticConstraints: { iterations: 8 }, kineticEarlyOut: { velocityEpsilonSq: 0.01 } }, () => {
            const settings = collisionSettings;
            assert.equal(settings.kineticConstraints.iterations, 8);
            assert.equal(settings.kineticConstraints.velocityBias, LIBRARY_COLLISION_DEFAULTS.kineticConstraints.velocityBias);
            assert.equal(settings.kineticEarlyOut.velocityEpsilonSq, 0.01);
            assert.equal(settings.kineticEarlyOut.constraintErrorEpsilon, LIBRARY_COLLISION_DEFAULTS.kineticEarlyOut.constraintErrorEpsilon);
            assert.equal(settings.kineticEarlyOut.contactImpulseEpsilon, LIBRARY_COLLISION_DEFAULTS.kineticEarlyOut.contactImpulseEpsilon);
            settings.kineticConstraints.iterations = 99;
        });
        assert.equal(LIBRARY_COLLISION_DEFAULTS.kineticConstraints.iterations, 4);
    });
});
