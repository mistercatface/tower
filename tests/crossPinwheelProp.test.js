import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { WorldProp } from "../Libraries/Props/props.js";
import { createKineticTestTick, kineticIntegrateHooks, mockKineticCircle } from "./harness/kineticTickHarness.js";
import { runKineticPhysics, checkEntityPairCollision, normalizeKineticBody, kineticInertiaFromBody, kineticFootprintArea } from "../Libraries/Physics/physics.js";
import { applyCrossPinwheelFootprint } from "../Libraries/Props/props.js";
import { resolveKineticContactPass } from "./harness/kineticContactHarness.js";

describe("cross pinwheel prop", () => {
    it("initializes as a kinetic compound body", () => {
        const pinwheel = new WorldProp(0, 0, "cross_pinwheel", 0);
        assert.equal(pinwheel.strategy.isKinetic, true);
        assert.ok(pinwheel.collisionParts.length > 1, "Should have multiple collision parts");
        assert.equal(pinwheel.collisionParts[0].type, "Polygon");
        assert.equal(pinwheel.collisionParts[1].type, "Polygon");
        assert.equal(kineticFootprintArea(pinwheel), 512);
        assert.ok(pinwheel.mass > 0);
        assert.ok(kineticInertiaFromBody(pinwheel) > 0);
        normalizeKineticBody(pinwheel);
        assert.ok(1 / pinwheel.mass > 0);
    });

    it("absorbs angular velocity and rotates when hit", () => {
        const pinwheel = new WorldProp(0, 0, "cross_pinwheel", 0);
        const projectile = mockKineticCircle(12, 15, 4, 0, -100, {
            strategy: { isKinetic: true },
            update(dt) {
                this.x += (this.vx ?? 0) * (dt / 1000);
                this.y += (this.vy ?? 0) * (dt / 1000);
            },
        });

        const tick = createKineticTestTick([pinwheel, projectile]);
        assert.equal(pinwheel.angularVelocity ?? 0, 0);
        const originalFacing = pinwheel.facing;

        runKineticPhysics(tick, 100, kineticIntegrateHooks((prop, subDt) => prop.update(subDt)));
        runKineticPhysics(tick, 50, kineticIntegrateHooks((prop, subDt) => prop.update(subDt)));

        assert.ok(Math.abs(pinwheel.angularVelocity) > 0.01, `Should have non-zero angular velocity, got ${pinwheel.angularVelocity}`);
        assert.notEqual(pinwheel.facing, originalFacing);
    });

    it("separates from another cross on contact", () => {
        const left = new WorldProp(0, 0, "cross_pinwheel", 0);
        const right = new WorldProp(8, 0, "cross_pinwheel", 0);
        right.vx = 40;
        assert.ok(checkEntityPairCollision(left, right));
        const tick = createKineticTestTick([left, right]);
        for (let i = 0; i < 12; i++) resolveKineticContactPass(tick);
        assert.ok(!checkEntityPairCollision(left, right));
    });

    it("angular velocity decays after spin", () => {
        const pinwheel = new WorldProp(0, 0, "cross_pinwheel", 0);
        pinwheel.angularVelocity = 5;
        for (let i = 0; i < 120; i++) pinwheel.tickPropSubstep(16);
        assert.ok(Math.abs(pinwheel.angularVelocity) < 0.1, `spin should decay, got ${pinwheel.angularVelocity}`);
        assert.equal(pinwheel.vx, 0);
        assert.equal(pinwheel.vy, 0);
    });

    it("can customize dimensions and resizes shape parts", () => {
        const pinwheel = new WorldProp(0, 0, "cross_pinwheel", 0);
        applyCrossPinwheelFootprint(pinwheel, 48, 10);

        assert.equal(pinwheel.crossLength, 48);
        assert.equal(pinwheel.crossThickness, 10);
        assert.ok(Math.abs(pinwheel.radius - Math.hypot(24, 5)) < 1e-6);

        const part0 = pinwheel.collisionParts[0];
        assert.equal(part0.vertices[0], -24);
        assert.equal(part0.vertices[1], -5);
        assert.equal(part0.vertices[4], 24);
        assert.equal(part0.vertices[5], 5);
        assert.equal(kineticFootprintArea(pinwheel), 960);
        assert.ok(1 / pinwheel.mass > 0);
        assert.equal(pinwheel.drawOutline.length, 24);
    });

    it("sets drawOutline for pinwheel, star, and gear", () => {
        const pinwheel = new WorldProp(0, 0, "cross_pinwheel", 0);
        assert.ok(pinwheel.drawOutline instanceof Float32Array);
        assert.equal(pinwheel.drawOutline.length, 24);

        const star = new WorldProp(0, 0, "star_block", 0);
        assert.ok(star.drawOutline instanceof Float32Array);
        assert.equal(star.drawOutline.length / 2, 10);

        const gear = new WorldProp(0, 0, "gear_block", 0);
        assert.ok(gear.drawOutline instanceof Float32Array);
        assert.ok(gear.drawOutline.length / 2 >= 24, `gear outline verts should be high, got ${gear.drawOutline.length / 2}`);
        assert.equal(gear.drawOutline.length / 2, 48);
    });
});
