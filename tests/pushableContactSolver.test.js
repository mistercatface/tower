import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CircleShape } from "../Libraries/Spatial/collision/Shapes.js";
import { CombatSpatialFrame } from "../Systems/World/CombatSpatialFrame.js";
import { resolvePushableContactPass } from "../Libraries/Spatial/collision/pushableContactSolver.js";
let nextId = 1;
function mockCircleBody(x, y, radius, vx = 0, vy = 0) {
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
        strategy: { isPushable: true },
        mass: radius,
        get momentOfInertia() {
            return this.mass * this.radius * this.radius * 0.5;
        },
        getShape() {
            return new CircleShape(this.radius);
        },
    };
}
describe("pushable contact solver", () => {
    it("separates overlapping circles and applies opposing impulses", () => {
        const frame = new CombatSpatialFrame(50);
        const a = mockCircleBody(0, 0, 10, 50, 0);
        const b = mockCircleBody(15, 0, 10, -30, 0);
        frame.resetFrame({ minX: -500, maxX: 500, minY: -500, maxY: 500 });
        frame.insertEntity(a, 0);
        frame.insertEntity(b, 1);
        frame._pushables.push(a, b);
        frame._activePushables.push(a, b);
        resolvePushableContactPass(frame, {});
        assert.ok(a.x < 0);
        assert.ok(b.x > 15);
        assert.ok(a.vx < 50);
        assert.ok(b.vx > -30);
    });
});
