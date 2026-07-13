import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createFractureWorld } from "./harness/fractureHarness.js";
import { assignPhysIdWithPose } from "./harness/kineticTickHarness.js";
import { entityVx, entityVy, entityW, entityFacing, entityX, entityY } from "../Core/engineMemory.js";
import { applyPropBoxFootprint } from "../Libraries/Props/props.js";
import { applyVelocityDamping, primitiveDragFrictionEid } from "../Libraries/Physics/physics.js";

describe("kinetic debris damping", () => {
    it("pose accessors read and write entity columns when _physId is set", () => {
        const world = createFractureWorld();
        const body = world.fractureEngine.acquireDebrisProp("box", 0, 0, 0);
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
        entityVx[0] = 40;
        entityVy[0] = -10;
        entityX[0] = 99;
        entityY[0] = 88;
        assert.equal(body.vx, 40);
        assert.equal(body.vy, -10);
        assert.equal(body.x, 99);
        assert.equal(body.y, 88);
    });

    it("applyVelocityDamping clears debris velocity on entity columns", () => {
        const world = createFractureWorld();
        const body = world.fractureEngine.acquireDebrisProp("box", 0, 0, 0);
        applyPropBoxFootprint(body, 8, 8);
        assignPhysIdWithPose(body, 0);
        body.vx = 200;
        body.vy = 200;
        const eid = body._physId;
        for (let i = 0; i < 120; i++) applyVelocityDamping(eid, 16, primitiveDragFrictionEid(eid));
        assert.equal(body.vx, 0);
        assert.equal(body.vy, 0);
        assert.equal(entityVx[0], 0);
        assert.equal(entityVy[0], 0);
    });
});
