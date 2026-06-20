import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { loadPropAssets } from "../Libraries/Props/loadPropAssets.js";
import { WorldProp } from "../Entities/WorldProp.js";
import { applyPropBoxFootprint } from "../Libraries/Props/propStrategy.js";
import { CircleShape } from "../Libraries/Spatial/collision/Shapes.js";
import { SatCollision } from "../Libraries/Spatial/collision/SatCollision.js";
import { separateAlongNormal } from "../Libraries/Spatial/collision/penetration.js";
import { resolveKineticContactPass } from "./harness/kineticContactHarness.js";
import { createKineticTestTick } from "./harness/kineticTickHarness.js";
import { dotXY } from "../Libraries/Math/Vec2.js";
import { setCirclePropRadius } from "../Libraries/Props/propScale.js";
loadPropAssets();
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
function pairStillOverlaps(a, b) {
    return SatCollision.checkCollision(a, a.getShape(), b, b.getShape()) != null;
}
function separatePairUntilClear(a, b, maxPasses = 8) {
    let last = null;
    for (let pass = 0; pass < maxPasses; pass++) {
        const info = SatCollision.checkCollision(a, a.getShape(), b, b.getShape());
        if (!info) return last;
        last = info;
        if (info.coincident) break;
        separateAlongNormal(a, b, info.nx, info.ny, info.overlap, a.mass, b.mass);
    }
    return last;
}
function resolveContactUntilClear(tick, maxPasses = 4) {
    for (let pass = 0; pass < maxPasses; pass++) {
        resolveKineticContactPass(tick);
        const [a, b] = tick.frame._activeKineticBodies;
        if (!pairStillOverlaps(a, b)) return;
    }
}
describe("kinetic contact solver", () => {
    it("separates overlapping circles and applies opposing impulses", () => {
        const a = mockCircleBody(0, 0, 10, 50, 0);
        const b = mockCircleBody(15, 0, 10, -30, 0);
        resolveKineticContactPass(createKineticTestTick([a, b]));
        assert.ok(a.x < 0);
        assert.ok(b.x > 15);
        assert.ok(a.vx < 50);
        assert.ok(b.vx > -30);
    });
    it("friction reduces tangential slip between contacting circles", () => {
        const a = mockCircleBody(0, 0, 10, 40, 0, 0.8);
        const b = mockCircleBody(12, 0, 10, 0, 0, 0.8);
        resolveKineticContactPass(createKineticTestTick([a, b]));
        assert.ok(Math.abs(a.vx) < 40);
    });
    it("resting overlapping circles are left alone until one moves", () => {
        const a = mockCircleBody(0, 0, 10, 0, 0);
        const b = mockCircleBody(15, 0, 10, 0, 0);
        const ax0 = a.x;
        const bx0 = b.x;
        resolveKineticContactPass(createKineticTestTick([a, b]));
        assert.equal(a.x, ax0);
        assert.equal(b.x, bx0);
    });
});
describe("poly-poly kinetic contact", () => {
    it("axis-aligned crate pair separates with +x normal when B is to the right", () => {
        const left = new WorldProp(0, 0, "crate", 0);
        const right = new WorldProp(10, 0, "crate", 0);
        const info = separatePairUntilClear(left, right);
        assert.ok(info);
        assert.ok(info.overlap > 0);
        assert.ok(info.nx > 0.9);
        assert.ok(Math.abs(info.ny) < 0.1);
        assert.ok(!pairStillOverlaps(left, right));
    });
    it("tri wedge and hex block separate with normal pointing B away from A", () => {
        const wedge = new WorldProp(-2, 0, "tri_wedge", 0);
        const hex = new WorldProp(8, 0, "hex_block", 0);
        const info = separatePairUntilClear(wedge, hex);
        assert.ok(info);
        assert.ok(info.overlap > 0);
        const centerDx = hex.x - wedge.x;
        const centerDy = hex.y - wedge.y;
        assert.ok(dotXY(info.nx, info.ny, centerDx, centerDy) > 0);
        assert.ok(!pairStillOverlaps(wedge, hex));
    });
    it("stacked crates separate vertically with upward normal on upper body", () => {
        const bottom = new WorldProp(0, 0, "crate", 0);
        const top = new WorldProp(0, 10, "crate", 0);
        const info = separatePairUntilClear(bottom, top);
        assert.ok(info);
        assert.ok(info.ny > 0.9);
        assert.ok(!pairStillOverlaps(bottom, top));
    });
    it("resolveKineticContactPass separates overlapping bar and crate", () => {
        const bar = new WorldProp(0, 0, "custom_box", 0);
        applyPropBoxFootprint(bar, 8, 4);
        const box = new WorldProp(12, 0, "crate", 0);
        box.vx = -20;
        assert.ok(pairStillOverlaps(bar, box));
        resolveContactUntilClear(createKineticTestTick([bar, box]));
        assert.ok(!pairStillOverlaps(bar, box));
    });
    it("circle-poly ball and tri wedge separate with normal toward polygon", () => {
        const ball = new WorldProp(0, 0, "ball", 0);
        setCirclePropRadius(ball, 7);
        const wedge = new WorldProp(10, 0, "tri_wedge", 0);
        const info = separatePairUntilClear(ball, wedge);
        assert.ok(info);
        assert.ok(info.overlap > 0);
        const centerDx = wedge.x - ball.x;
        assert.ok(dotXY(info.nx, info.ny, centerDx, 0) > 0);
        assert.ok(!pairStillOverlaps(ball, wedge));
    });
    it("approaching poly pair slows head-on approach and separates", () => {
        const a = new WorldProp(0, 0, "hex_block", 0);
        const b = new WorldProp(10, 0, "hex_block", 0);
        a.vx = 40;
        b.vx = -20;
        resolveContactUntilClear(createKineticTestTick([a, b]));
        assert.ok(!pairStillOverlaps(a, b));
        assert.ok(a.vx < 40);
        assert.ok(b.vx > -20);
    });
    it("poly pair friction reduces tangential slip on block slide", () => {
        const left = new WorldProp(0, 0, "custom_box", 0);
        applyPropBoxFootprint(left, 8, 4);
        const right = new WorldProp(12, 0, "custom_box", 0);
        applyPropBoxFootprint(right, 8, 4);
        left.vx = 35;
        right.vx = 0;
        resolveKineticContactPass(createKineticTestTick([left, right]));
        assert.ok(left.vx < 35);
    });
});
