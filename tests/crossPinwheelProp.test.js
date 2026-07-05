import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { WorldProp } from "../Entities/WorldProp.js";
import { createKineticTestTick, mockKineticCircle } from "./harness/kineticTickHarness.js";
import { runKineticPhysics } from "../Libraries/Physics/kineticPhysicsPass.js";
import { inverseMassFromBody, momentOfInertiaFromBody, kineticFootprintArea } from "../Libraries/Physics/physicsSlabs.js";
import { applyCrossPinwheelFootprint } from "../Libraries/Props/propStrategy.js";

describe("cross pinwheel prop", () => {
    it("initializes as a pinned compound body", () => {
        const pinwheel = new WorldProp(0, 0, "cross_pinwheel", 0);
        assert.equal(pinwheel.strategy.pinned, true);
        assert.equal(pinwheel.strategy.isKinetic, true);
        assert.ok(pinwheel.collisionParts.length > 1, "Should have multiple collision parts");
        assert.equal(pinwheel.collisionParts[0].type, "Polygon");
        assert.equal(pinwheel.collisionParts[1].type, "Polygon");
        
        // Footprint area should sum both parts (each part is 32 * 8 = 256, so total area should be 512)
        assert.equal(kineticFootprintArea(pinwheel), 512);

        // Mass and inertia should be correctly populated
        assert.ok(pinwheel.mass > 0);
        assert.ok(momentOfInertiaFromBody(pinwheel) > 0);

        // Pinned body should have 0 inverse mass
        assert.equal(inverseMassFromBody(pinwheel), 0);
    });

    it("absorbs angular velocity and rotates when hit, but position remains pinned", () => {
        // Create the pinned cross pinwheel at the center
        const pinwheel = new WorldProp(0, 0, "cross_pinwheel", 0);

        // Create a fast moving projectile sphere that will hit the wing of the pinwheel offset from center
        // Pinwheel horizontal bar is x from -16 to 16, y from -4 to 4.
        // We shoot a ball from top to bottom hitting the right wing at x = 12, moving in -y direction.
        const projectile = mockKineticCircle(12, 15, 4, 0, -100, {
            strategy: { isKinetic: true },
            update(dt) {
                this.x += (this.vx ?? 0) * (dt / 1000);
                this.y += (this.vy ?? 0) * (dt / 1000);
            }
        });

        const tick = createKineticTestTick([pinwheel, projectile]);

        // Prior to tick, pinwheel is stationary
        assert.equal(pinwheel.vx, 0);
        assert.equal(pinwheel.vy, 0);
        assert.equal(pinwheel.angularVelocity ?? 0, 0);
        const originalX = pinwheel.x;
        const originalY = pinwheel.y;
        const originalFacing = pinwheel.facing;

        // Run the physics step
        // We run a physics tick with dt = 100
        runKineticPhysics(tick, 100, {
            updateProp: (prop, subDt) => prop.update(subDt),
            resolveWalls: () => {},
            applyContactSideEffects: () => {},
        });

        // Run a second small step to integrate the angular velocity into facing angle
        runKineticPhysics(tick, 50, {
            updateProp: (prop, subDt) => prop.update(subDt),
            resolveWalls: () => {},
            applyContactSideEffects: () => {},
        });

        // After tick:
        // 1. Pinwheel position should remain exactly at (0, 0) since it's pinned
        assert.equal(pinwheel.x, originalX);
        assert.equal(pinwheel.y, originalY);
        assert.equal(pinwheel.vx, 0);
        assert.equal(pinwheel.vy, 0);

        // 2. Pinwheel should have received torque and rotating impulse, so angular velocity is non-zero
        assert.ok(Math.abs(pinwheel.angularVelocity) > 0.01, `Should have non-zero angular velocity, got ${pinwheel.angularVelocity}`);

        // 3. Pinwheel orientation (facing) should have changed
        assert.notEqual(pinwheel.facing, originalFacing);
    });

    it("can customize dimensions and resizes shape parts", () => {
        const pinwheel = new WorldProp(0, 0, "cross_pinwheel", 0);
        
        // Resize the pinwheel to length = 48, thickness = 10
        applyCrossPinwheelFootprint(pinwheel, 48, 10);

        assert.equal(pinwheel.crossLength, 48);
        assert.equal(pinwheel.crossThickness, 10);

        // Max radius should be Math.hypot(24, 5) = Math.sqrt(576 + 25) = Math.sqrt(601) ≈ 24.51
        assert.ok(Math.abs(pinwheel.radius - Math.hypot(24, 5)) < 1e-6);

        // Vertices of the horizontal bar (part 0) should be sized to 48x10
        const part0 = pinwheel.collisionParts[0];
        assert.equal(part0.vertices[0], -24);
        assert.equal(part0.vertices[1], -5);
        assert.equal(part0.vertices[4], 24);
        assert.equal(part0.vertices[5], 5);

        // Combined area should be 2 * (48 * 10) = 960
        assert.equal(kineticFootprintArea(pinwheel), 960);
    });
});
