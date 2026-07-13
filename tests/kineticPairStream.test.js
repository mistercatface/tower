import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { WorldProp } from "../Libraries/Props/props.js";
import { createKineticTestTick, mockKineticCircle, snapshotKineticBodySlab } from "./harness/kineticTickHarness.js";
import { resolveKineticContactPass, checkPairAtSlabPose } from "./harness/kineticContactHarness.js";
import { runCollisionPipeline } from "../Libraries/Physics/physics.js";
import { kineticDynamicSlab } from "../Core/engineMemory.js";
import { noop } from "./harness/kineticTickHarness.js";

describe("kinetic pair stream", () => {
    it("moving body wakes sleeping overlapping neighbor during contact pass", () => {
        const mover = mockKineticCircle(0, 0, 10, 40, 0);
        const sleeper = mockKineticCircle(18, 0, 10, 0, 0);
        sleeper.isSleeping = true;
        const tick = createKineticTestTick([mover, sleeper]);
        resolveKineticContactPass(tick);
        assert.equal(sleeper.isSleeping, false);
    });
    it("contact pass still separates moving circle pair", () => {
        const a = mockKineticCircle(0, 0, 10, 50, 0);
        const b = mockKineticCircle(15, 0, 10, -30, 0);
        resolveKineticContactPass(createKineticTestTick([a, b]));
        assert.ok(kineticDynamicSlab.x[a._physId] < 0);
        assert.ok(kineticDynamicSlab.x[b._physId] > 15);
    });
    it("contact pass still ignores resting overlapping circles", () => {
        const a = mockKineticCircle(0, 0, 10, 0, 0);
        const b = mockKineticCircle(15, 0, 10, 0, 0);
        const ax0 = a.x;
        const bx0 = b.x;
        resolveKineticContactPass(createKineticTestTick([a, b]));
        assert.equal(a.x, ax0);
        assert.equal(b.x, bx0);
    });
    it("resting crate stack emits no pairs until one body moves", () => {
        const bottom = new WorldProp(0, 0, "box", 0);
        const top = new WorldProp(0, 14, "box", 0);
        top.vx = 0;
        bottom.vx = 0;
        const restingTick = createKineticTestTick([bottom, top]);
        runCollisionPipeline(restingTick, noop, noop, 1);
        assert.equal(restingTick.world.kinetic.kineticSolverStats.pairCount, 0);
        top.vx = 12;
        snapshotKineticBodySlab(kineticDynamicSlab.activePhysIds, kineticDynamicSlab.activePhysCount);
        const movingTick = createKineticTestTick([bottom, top]);
        runCollisionPipeline(movingTick, noop, noop, 1);
        assert.ok(movingTick.world.kinetic.kineticSolverStats.pairCount >= 1);
    });
    it("three-body contact resolves without leaving movers overlapped", () => {
        const left = mockKineticCircle(0, 0, 10, 0, 0);
        const center = mockKineticCircle(18, 0, 10, 25, 0);
        const right = mockKineticCircle(36, 0, 10, 0, 0);
        const tick = createKineticTestTick([left, center, right]);
        resolveKineticContactPass(tick);
        assert.ok(!checkPairAtSlabPose(left, center) || center.vx !== 25);
    });
});
