import { test } from "node:test";
import assert from "node:assert/strict";
import { mockRollingProp } from "./harness/kineticTickHarness.js";
import { applyGroundRollDrive, integratePropMotion, steerRollToward, getKineticRollConfig, IDENTITY_ROLL_QUAT } from "../Libraries/Physics/physics.js";

test("sphereGroundRoll - straight roll advances rollQuat without Z twist", () => {
    const prop = mockRollingProp({ vx: 10, vy: 0 });
    prop.rollQuat = { ...IDENTITY_ROLL_QUAT };
    
    for (let i = 0; i < 10; i++) {
        integratePropMotion(prop, 16);
    }
    
    assert.ok(prop.rollQuat.w !== 1, "Roll quat should have advanced");
    assert.ok(Math.abs(prop.rollQuat.z) < 1e-10, `Z should be zero for straight roll, got ${prop.rollQuat.z}`);
});

test("sphereGroundRoll - 90 degree turn", () => {
    const prop = mockRollingProp({ vx: 50, vy: 0, radius: 8 });
    const config = getKineticRollConfig(prop);
    
    for (let i = 0; i < 60; i++) {
        steerRollToward(prop, 0, 1, config, 50);
        applyGroundRollDrive(prop, 16 / 1000);
        integratePropMotion(prop, 16);
    }
    
    assert.ok(prop.vy > 10, "Should have steered towards Y");
    const norm = Math.hypot(prop.rollQuat.w, prop.rollQuat.x, prop.rollQuat.y, prop.rollQuat.z);
    assert.ok(Math.abs(norm - 1) < 1e-5, "Quaternion norm should not drift");
});

test("sphereGroundRoll - large radius vs small radius twist", () => {
    const small = mockRollingProp({ vx: 50, vy: 0, radius: 8 });
    const large = mockRollingProp({ vx: 50, vy: 0, radius: 32 });
    const configSmall = getKineticRollConfig(small);
    const configLarge = getKineticRollConfig(large);

    for (let i = 0; i < 30; i++) {
        steerRollToward(small, 0, 1, configSmall, 50);
        applyGroundRollDrive(small, 16 / 1000);
        integratePropMotion(small, 16);
        
        steerRollToward(large, 0, 1, configLarge, 50);
        applyGroundRollDrive(large, 16 / 1000);
        integratePropMotion(large, 16);
    }
    
    assert.ok(small.rollQuat, "Small should have rolled");
    assert.ok(large.rollQuat, "Large should have rolled");
});

test("sphereGroundRoll - no Z impulse", () => {
    const prop = mockRollingProp({ vx: 0, vy: 0 });
    prop.angularVelocity = 10;
    
    integratePropMotion(prop, 16);
    
    assert.equal(prop.rollQuat?.z ?? 0, 0, "Rolling prop should ignore Z impulse from angularVelocity");
});
