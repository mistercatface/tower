import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createFractureWorld } from "./harness/fractureHarness.js";
import { assignPhysIdWithPose } from "./harness/kineticTickHarness.js";
import { entityVx, entityVy, entityW, entityFacing } from "../Core/engineMemory.js";
import { snapshotKineticBodySlab, writebackActiveKineticBodySlab } from "../Libraries/Physics/physics.js";
import { applyPropBoxFootprint } from "../Libraries/Props/props.js";

describe("kinetic debris damping", () => {
    it("pose setters dual-write entity* when _physId is set", () => {
        const world = createFractureWorld();
        const body = world.fractureEngine.debris.acquireBody("glass_pane", 0, 0, 0);
        applyPropBoxFootprint(body, 8, 8);
        assignPhysIdWithPose(body, 0);
        body.vx = 200;
        body.vy = -50;
        body.angularVelocity = 3;
        body.facing = 1.1;
        assert.equal(entityVx[0], 200);
        assert.equal(entityVy[0], -50);
        assert.equal(entityW[0], 3);
        assert.ok(Math.abs(entityFacing[0] - 1.1) < 1e-6);
    });

    it("tickPropSubstep damping clears velocity on debris slab and entity*", () => {
        const world = createFractureWorld();
        const body = world.fractureEngine.debris.acquireBody("glass_pane", 0, 0, 0);
        applyPropBoxFootprint(body, 8, 8);
        assignPhysIdWithPose(body, 0);
        body.vx = 200;
        body.vy = 200;
        for (let i = 0; i < 120; i++) body.tickPropSubstep(16);
        assert.equal(body.vx, 0);
        assert.equal(body.vy, 0);
        assert.equal(entityVx[0], 0);
        assert.equal(entityVy[0], 0);
    });

    it("writeback after damping does not reintroduce velocity", () => {
        const world = createFractureWorld();
        const body = world.fractureEngine.debris.acquireBody("glass_pane", 0, 0, 0);
        applyPropBoxFootprint(body, 8, 8);
        assignPhysIdWithPose(body, 0);
        body.vx = 200;
        body.vy = 200;
        for (let i = 0; i < 120; i++) body.tickPropSubstep(16);
        snapshotKineticBodySlab([body]);
        writebackActiveKineticBodySlab([body]);
        assert.equal(body.vx, 0);
        assert.equal(body.vy, 0);
        assert.equal(entityVx[0], 0);
        assert.equal(entityVy[0], 0);
    });
});
