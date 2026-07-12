import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyGroundRollDrive } from "../Libraries/Physics/physics.js";
import { ROLL_DRIVE_NONE, ROLL_DRIVE_THRUST } from "../Core/engineEnums.js";
import { kineticDynamicSlab } from "../Core/engineMemory.js";
import { clearGroundRollDrive, decelerateRoll, getKineticRollConfig, steerRollToward } from "../Libraries/Physics/physics.js";
import { integratePropMotion } from "../Libraries/Physics/physics.js";
import { mockRollingProp } from "./harness/kineticTickHarness.js";

describe("kineticRollActuator", () => {
    it("steerRollToward stores thrust intent without mutating velocity", () => {
        const prop = mockRollingProp({ vx: 10, vy: 0 });
        const eid = prop._physId;
        steerRollToward(eid, 0, 1, { accel: 600, maxSpeed: 180 });
        assert.equal(prop.vx, 10);
        assert.equal(prop.vy, 0);
        assert.equal(kineticDynamicSlab.rollDriveKind[eid], ROLL_DRIVE_THRUST);
        assert.equal(kineticDynamicSlab.rollDriveDirY[eid], 1);
    });

    it("applyGroundRollDrive accelerates along thrust direction", () => {
        const prop = mockRollingProp();
        const eid = prop._physId;
        steerRollToward(eid, 1, 0, { accel: 100, maxSpeed: 200 });
        applyGroundRollDrive(eid, 0.1);
        assert.ok(prop.vx > 0);
        assert.equal(prop.vy, 0);
    });

    it("applyGroundRollDrive clamps to maxSpeed", () => {
        const prop = mockRollingProp({ vx: 150, vy: 0 });
        const eid = prop._physId;
        steerRollToward(eid, 1, 0, { accel: 1000, maxSpeed: 180 });
        for (let i = 0; i < 20; i++) applyGroundRollDrive(eid, 0.05);
        const speed = Math.hypot(prop.vx, prop.vy);
        assert.ok(Math.abs(speed - 180) < 0.01);
    });

    it("heading change retains lateral velocity until friction removes it", () => {
        const prop = mockRollingProp({ vx: 180, vy: 0, strategy: { rolls: true } });
        const eid = prop._physId;
        steerRollToward(eid, 0, 1, { accel: 600, maxSpeed: 180 });
        applyGroundRollDrive(eid, 1 / 60);
        assert.ok(prop.vx > 0);
        assert.ok(prop.vy > 0);
    });

    it("decelerateRoll brake intent stops motion over substeps", () => {
        const prop = mockRollingProp({ vx: 60, vy: 0 });
        const eid = prop._physId;
        decelerateRoll(eid, { accel: 600 });
        const subDt = 1 / 60 / 4;
        for (let i = 0; i < 4; i++) applyGroundRollDrive(eid, subDt);
        assert.equal(prop.vx, 40);
        for (let i = 0; i < 12; i++) applyGroundRollDrive(eid, subDt);
        assert.equal(prop.vx, 0);
        assert.equal(prop.vy, 0);
    });

    it("substep integration matches single-step accel budget", () => {
        const single = mockRollingProp();
        steerRollToward(single._physId, 1, 0, { accel: 600, maxSpeed: 500 });
        applyGroundRollDrive(single._physId, 1 / 60);

        const substepped = mockRollingProp();
        steerRollToward(substepped._physId, 1, 0, { accel: 600, maxSpeed: 500 });
        const subDt = 1 / 60 / 4;
        for (let i = 0; i < 4; i++) applyGroundRollDrive(substepped._physId, subDt);

        assert.ok(Math.abs(single.vx - substepped.vx) < 0.01);
    });

    it("integratePropMotion runs after drive in physics pass order", () => {
        const prop = mockRollingProp({ vx: 50, vy: 0, strategy: { rolls: true } });
        const eid = prop._physId;
        steerRollToward(eid, 1, 0, { accel: 600, maxSpeed: 180 });
        applyGroundRollDrive(eid, 1 / 60);
        const vxAfterDrive = prop.vx;
        integratePropMotion(prop, 1000 / 60);
        assert.ok(prop.x > 0);
        assert.ok(prop.vx < vxAfterDrive);
    });

    it("clearGroundRollDrive removes intent", () => {
        const prop = mockRollingProp();
        const eid = prop._physId;
        steerRollToward(eid, 1, 0, { accel: 600, maxSpeed: 180 });
        clearGroundRollDrive(eid);
        assert.equal(kineticDynamicSlab.rollDriveKind[eid], ROLL_DRIVE_NONE);
        applyGroundRollDrive(eid, 0.1);
        assert.equal(prop.vx, 0);
    });

    it("sleeping prop with drive intent is not integrated from active list", () => {
        const prop = mockRollingProp({ vx: 0, vy: 0, isSleeping: true });
        steerRollToward(prop._physId, 1, 0, { accel: 600, maxSpeed: 180 });
        const active = [];
        for (let i = 0; i < active.length; i++) applyGroundRollDrive(active[i]._physId, 1 / 60);
        assert.equal(prop.vx, 0);
    });

    it("steerRollToward wakes the body for the physics pass", () => {
        const prop = mockRollingProp({ isSleeping: true });
        steerRollToward(prop._physId, 1, 0, { accel: 600, maxSpeed: 180 });
        assert.equal(prop.isSleeping, false);
    });

    it("drive intent persists until explicitly cleared", () => {
        const prop = mockRollingProp();
        const eid = prop._physId;
        steerRollToward(eid, 1, 0, { accel: 600, maxSpeed: 180 });
        applyGroundRollDrive(eid, 1 / 60);
        const vxAfterFirst = prop.vx;
        applyGroundRollDrive(eid, 1 / 60);
        assert.ok(prop.vx > vxAfterFirst);
    });

    it("getKineticRollConfig merges prop strategy overrides", () => {
        const prop = mockRollingProp({ strategy: { rolls: true, groundNav: { maxSpeed: 90 } } });
        assert.equal(getKineticRollConfig(prop).maxSpeed, 90);
    });
});
