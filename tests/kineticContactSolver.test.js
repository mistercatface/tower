import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CircleShape } from "../Libraries/Spatial/collision/Shapes.js";
import { KineticSpatialFrame } from "../Systems/World/KineticSpatialFrame.js";
import { resolveKineticContactPass } from "../Libraries/Spatial/collision/kineticContactSolver.js";
let nextId = 1;
function mockCircleBody(x, y, radius, vx = 0, vy = 0, pairFriction = null) {
    const strategy = { isKinetic: true };
    if (pairFriction != null) strategy.pairFriction = pairFriction;
    return {
        id: nextId++,
        x,
        y,
        radius,
        vx,
        vy,
        angularVelocity: 0,
        isSleeping: false,
        isDead: false,
        strategy,
        mass: radius,
        get momentOfInertia() {
            return this.mass * this.radius * this.radius * 0.5;
        },
        getShape() {
            return new CircleShape(this.radius);
        },
    };
}
function setupPairFrame(a, b) {
    const frame = new KineticSpatialFrame(50);
    frame.resetFrame({ minX: -500, maxX: 500, minY: -500, maxY: 500 });
    frame.insertEntity(a, 0);
    frame.insertEntity(b, 1);
    frame._kineticBodies.push(a, b);
    frame._activeKineticBodies.push(a, b);
    return frame;
}
describe("kinetic contact solver", () => {
    it("separates overlapping circles and applies opposing impulses", () => {
        const a = mockCircleBody(0, 0, 10, 50, 0);
        const b = mockCircleBody(15, 0, 10, -30, 0);
        const frame = setupPairFrame(a, b);
        resolveKineticContactPass(frame, {});
        assert.ok(a.x < 0);
        assert.ok(b.x > 15);
        assert.ok(a.vx < 50);
        assert.ok(b.vx > -30);
    });
    it("friction reduces tangential slip between contacting circles", () => {
        const a = mockCircleBody(0, 0, 10, 40, 0, 0.8);
        const b = mockCircleBody(12, 0, 10, 0, 0, 0.8);
        const frame = setupPairFrame(a, b);
        resolveKineticContactPass(frame, {});
        assert.ok(Math.abs(a.vx) < 40);
    });
});
