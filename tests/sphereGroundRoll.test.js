import { test } from "node:test";
import assert from "node:assert/strict";
import { mockRollingProp } from "./harness/kineticTickHarness.js";
import { applyGroundRollDrive, integratePropMotion, steerRollToward, physicsSettings } from "../Libraries/Physics/physics.js";

test("sphereGroundRoll - straight roll advances rollQuat without Z twist", () => {
    const prop = mockRollingProp({ vx: 10, vy: 0 });
    prop.rollQw = 1;
    prop.rollQx = 0;
    prop.rollQy = 0;
    prop.rollQz = 0;

    for (let i = 0; i < 10; i++) {
        integratePropMotion(prop, 16);
    }

    assert.ok(prop.rollQw !== 1, "Roll quat should have advanced");
    assert.ok(Math.abs(prop.rollQz) < 1e-10, `Z should be zero for straight roll, got ${prop.rollQz}`);
});

test("sphereGroundRoll - 90 degree turn", () => {
    const prop = mockRollingProp({ vx: 50, vy: 0, radius: 8 });
    const config = physicsSettings.groundNavRoll;

    for (let i = 0; i < 60; i++) {
        steerRollToward(prop._physId, 0, 1, config, 50);
        applyGroundRollDrive(prop._physId, 16 / 1000);
        integratePropMotion(prop, 16);
    }

    assert.ok(prop.vy > 10, "Should have steered towards Y");
    const norm = Math.hypot(prop.rollQw, prop.rollQx, prop.rollQy, prop.rollQz);
    assert.ok(Math.abs(norm - 1) < 1e-5, "Quaternion norm should not drift");
});

test("sphereGroundRoll - large radius vs small radius twist", () => {
    const small = mockRollingProp({ vx: 50, vy: 0, radius: 8 });
    const large = mockRollingProp({ vx: 50, vy: 0, radius: 32 });
    const configSmall = physicsSettings.groundNavRoll;
    const configLarge = physicsSettings.groundNavRoll;

    for (let i = 0; i < 30; i++) {
        steerRollToward(small._physId, 0, 1, configSmall, 50);
        applyGroundRollDrive(small._physId, 16 / 1000);
        integratePropMotion(small, 16);

        steerRollToward(large._physId, 0, 1, configLarge, 50);
        applyGroundRollDrive(large._physId, 16 / 1000);
        integratePropMotion(large, 16);
    }

    assert.ok(Math.abs(small.rollQw - 1) > 1e-6 || Math.abs(small.rollQx) > 1e-6 || Math.abs(small.rollQy) > 1e-6, "Small should have rolled");
    assert.ok(Math.abs(large.rollQw - 1) > 1e-6 || Math.abs(large.rollQx) > 1e-6 || Math.abs(large.rollQy) > 1e-6, "Large should have rolled");
});

test("sphereGroundRoll - no Z impulse", () => {
    const prop = mockRollingProp({ vx: 0, vy: 0 });
    prop.angularVelocity = 10;

    integratePropMotion(prop, 16);

    assert.equal(prop.rollQz, 0, "Rolling prop should ignore Z impulse from angularVelocity");
});
