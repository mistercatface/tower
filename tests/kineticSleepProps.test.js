import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { WorldProp } from "../Libraries/Props/props.js";
import { LIBRARY_COLLISION_DEFAULTS, runKineticPhysics } from "../Libraries/Physics/physics.js";
import { createKineticTestTick, kineticPhysicsHooks, assignPhysIdWithPose, snapshotKineticBodySlab } from "./harness/kineticTickHarness.js";
import { resolveKineticContactPass, checkPairAtSlabPose } from "./harness/kineticContactHarness.js";
import { kineticDynamicSlab } from "../Core/engineMemory.js";

const SLEEP_FRAMES = LIBRARY_COLLISION_DEFAULTS.kineticSleepFrames;

describe("kinetic sleep on proof props", () => {
    it("isolated crate sleeps after consecutive still frames", () => {
        const crate = new WorldProp(0, 0, "box", 0);
        const tick = createKineticTestTick([crate]);
        for (let i = 0; i < SLEEP_FRAMES; i++) runKineticPhysics(tick.frame, tick.world, 16.667, kineticPhysicsHooks());
        assert.equal(crate.isSleeping, true);
    });
    it("resting crate stack can sleep together", () => {
        const bottom = new WorldProp(0, 0, "box", 0);
        const top = new WorldProp(0, 14, "box", 0);
        const tick = createKineticTestTick([bottom, top]);
        for (let i = 0; i < SLEEP_FRAMES; i++) runKineticPhysics(tick.frame, tick.world, 16.667, kineticPhysicsHooks());
        assert.equal(bottom.isSleeping, true);
        assert.equal(top.isSleeping, true);
    });
    it("resting body stays asleep while a distant neighbor moves", () => {
        const rest = new WorldProp(0, 0, "box", 0);
        const mover = new WorldProp(80, 0, "box", 0);
        mover.vx = 5;
        const tick = createKineticTestTick([rest, mover]);
        for (let i = 0; i < SLEEP_FRAMES; i++) runKineticPhysics(tick.frame, tick.world, 16.667, kineticPhysicsHooks());
        assert.equal(rest.isSleeping, true);
        assert.equal(mover.isSleeping, false);
    });
    it("slow spin keeps tri wedge from sleeping", () => {
        const wedge = new WorldProp(0, 0, "tri_wedge", 0);
        wedge.vx = 0;
        wedge.vy = 0;
        wedge.angularVelocity = 0.12;
        const tick = createKineticTestTick([wedge]);
        runKineticPhysics(tick.frame, tick.world, 16.667, kineticPhysicsHooks());
        assert.equal(wedge.isSleeping, false);
        assert.ok(Math.abs(kineticDynamicSlab.w[wedge._physId]) > 0);
    });
    it("motion resets sleep counter on proof props", () => {
        const hex = new WorldProp(0, 0, "hex_block", 0);
        const tick = createKineticTestTick([hex]);
        for (let i = 0; i < SLEEP_FRAMES - 1; i++) runKineticPhysics(tick.frame, tick.world, 16.667, kineticPhysicsHooks());
        hex.vx = 5;
        runKineticPhysics(tick.frame, tick.world, 16.667, kineticPhysicsHooks());
        assert.equal(hex.isSleeping, false);
        assert.equal(hex._sleepFrames, 0);
    });
    it("resting overlapping pair skips contact resolve until something moves", () => {
        const a = new WorldProp(0, 0, "box", 0);
        const b = new WorldProp(0, 14, "box", 0);
        assignPhysIdWithPose(a, 0);
        assignPhysIdWithPose(b, 1);
        snapshotKineticBodySlab([a._physId, b._physId], 2);
        const ax0 = a.x;
        const bx0 = b.x;
        resolveKineticContactPass(createKineticTestTick([a, b]));
        assert.equal(a.x, ax0);
        assert.equal(b.x, bx0);
        a.vx = 10;
        const tick = createKineticTestTick([a, b]);
        resolveKineticContactPass(tick);
        assert.ok(a.x !== ax0 || b.x !== bx0 || !checkPairAtSlabPose(a, b));
    });
});
