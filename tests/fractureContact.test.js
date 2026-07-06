import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { FractureEngine } from "../Libraries/Physics/fracture.js";
import { WorldProp } from "../Libraries/Props/props.js";
import { applyPropBoxFootprint } from "../Libraries/Props/props.js";
import { kineticDynamicSlab } from "../Libraries/Physics/physics.js";
import { createKineticTestTick, mockKineticCircle, resetMockKineticCircleIds } from "./harness/kineticTickHarness.js";

describe("fracture contact queue", () => {
    it("fractures only the first qualifying body when both could fracture", () => {
        resetMockKineticCircleIds(1);
        const segA = mockKineticCircle(100, 100, 4, 0, 0, { strategy: { rolls: true, fracture: { mode: "circle", minForce: 12 } } });
        segA.type = "snake";
        const segB = mockKineticCircle(108, 100, 4, 0, 0, { strategy: { rolls: true, fracture: { mode: "circle", minForce: 12 } } });
        segB.type = "snake";
        const tick = createKineticTestTick([segA, segB]);
        tick.world.fractureEngine.queueFractureKineticContact(tick, segA, segB, 104, 100, 80);
        tick.world.fractureEngine.flushDeferredFractures(tick.world, tick.frame);
        const deadCount = [segA, segB].filter((p) => p.isDead).length;
        assert.equal(deadCount, 1);
    });

    it("skips fracture when _pendingEviction is already set", () => {
        resetMockKineticCircleIds(1);
        const prop = mockKineticCircle(100, 100, 4, 0, 0, { strategy: { fracture: { mode: "circle", minForce: 5 } } });
        prop.type = "snake";
        prop._pendingEviction = true;
        const impactor = mockKineticCircle(92, 100, 4, 200, 0, { strategy: { rolls: true } });
        const tick = createKineticTestTick([prop, impactor]);
        tick.world.fractureEngine.queueFractureKineticContact(tick, prop, impactor, 100, 100, 50);
        tick.world.fractureEngine.flushDeferredFractures(tick.world, tick.frame);
        assert.ok(!prop.isDead);
    });

    it("skips glass-on-glass mutual fracture", () => {
        resetMockKineticCircleIds(1);
        const a = new WorldProp(100, 100, "glass_pane", 0);
        a._physId = 1;
        kineticDynamicSlab.x[1] = 100;
        kineticDynamicSlab.y[1] = 100;
        applyPropBoxFootprint(a, 32, 32);
        const b = new WorldProp(108, 100, "glass_pane", 0);
        b._physId = 2;
        kineticDynamicSlab.x[2] = 108;
        kineticDynamicSlab.y[2] = 100;
        applyPropBoxFootprint(b, 32, 32);
        const tick = createKineticTestTick([a, b]);
        tick.world.fractureEngine.queueFractureKineticContact(tick, a, b, 104, 100, 80);
        tick.world.fractureEngine.flushDeferredFractures(tick.world, tick.frame);
        assert.ok(!a.isDead);
        assert.ok(!b.isDead);
    });

    it("respects fracture cooldown on chunk props", () => {
        const prop = new WorldProp(0, 0, "custom_box", 0);
        applyPropBoxFootprint(prop, 8, 8);
        prop._fractureCooldown = 4;
        const tick = createKineticTestTick([prop]);
        const other = { type: "ball", faction: null, strategy: {} };
        tick.world.fractureEngine.queueFractureKineticContact(tick, prop, other, 0, 0, 80);
        tick.world.fractureEngine.flushDeferredFractures(tick.world, tick.frame);
        assert.ok(prop.chunks?.length > 0);
        assert.equal(tick.world.worldProps.filter((p) => p !== prop).length, 0);
    });
});

describe("fracture mode dispatch", () => {
    it("resolveFractureMode returns mode entries", () => {
        assert.equal(FractureEngine.resolveFractureMode("chunk")?.retainParent, true);
        assert.equal(FractureEngine.resolveFractureMode("glass")?.retainParent, false);
        assert.equal(FractureEngine.resolveFractureMode("circle")?.skipCanSplit, true);
        assert.equal(FractureEngine.resolveFractureMode("unknown"), null);
    });

    it("shouldInitFractureFootprint is true only for chunk mode", () => {
        assert.equal(FractureEngine.shouldInitFractureFootprint({ strategy: { fracture: { mode: "chunk" } } }), true);
        assert.equal(FractureEngine.shouldInitFractureFootprint({ strategy: { fracture: { mode: "glass" } } }), false);
        assert.equal(FractureEngine.shouldInitFractureFootprint({ strategy: {} }), false);
    });
});
