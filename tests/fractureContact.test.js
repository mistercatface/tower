import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { WorldProp } from "../Libraries/Props/props.js";
import { applyPropBoxFootprint } from "../Libraries/Props/props.js";
import { createKineticTestTick } from "./harness/kineticTickHarness.js";

describe("fracture contact queue", () => {
    it("fractures only the first qualifying glass body when both could fracture", () => {
        const a = new WorldProp(100, 100, "glass_pane", 0);
        applyPropBoxFootprint(a, 32, 32);
        const b = new WorldProp(108, 100, "glass_pane", 0);
        applyPropBoxFootprint(b, 32, 32);
        const impactor = new WorldProp(92, 100, "ball", 0);
        const tick = createKineticTestTick([a, b, impactor]);
        tick.world.fractureEngine.queueFractureKineticContact(a, impactor, 104, 100, 80);
        tick.world.fractureEngine.flushDeferredFractures(tick.world, tick.frame);
        const deadCount = [a, b].filter((p) => p.isDead).length;
        assert.equal(deadCount, 1);
    });

    it("skips fracture when _pendingEviction is already set", () => {
        const prop = new WorldProp(100, 100, "glass_pane", 0);
        applyPropBoxFootprint(prop, 32, 32);
        prop._pendingEviction = true;
        const impactor = new WorldProp(92, 100, "ball", 0);
        const tick = createKineticTestTick([prop, impactor]);
        tick.world.fractureEngine.queueFractureKineticContact(prop, impactor, 100, 100, 50);
        tick.world.fractureEngine.flushDeferredFractures(tick.world, tick.frame);
        assert.ok(!prop.isDead);
    });

    it("skips glass-on-glass mutual fracture", () => {
        const a = new WorldProp(100, 100, "glass_pane", 0);
        applyPropBoxFootprint(a, 32, 32);
        const b = new WorldProp(108, 100, "glass_pane", 0);
        applyPropBoxFootprint(b, 32, 32);
        const tick = createKineticTestTick([a, b]);
        tick.world.fractureEngine.queueFractureKineticContact(a, b, 104, 100, 80);
        tick.world.fractureEngine.flushDeferredFractures(tick.world, tick.frame);
        assert.ok(!a.isDead);
        assert.ok(!b.isDead);
    });

    it("respects fracture cooldown on glass props", () => {
        const prop = new WorldProp(0, 0, "glass_pane", 0);
        applyPropBoxFootprint(prop, 32, 32);
        prop._fractureCooldown = 4;
        const tick = createKineticTestTick([prop]);
        const other = { type: "ball", faction: null, strategy: {} };
        tick.world.fractureEngine.queueFractureKineticContact(prop, other, 0, 0, 80);
        tick.world.fractureEngine.flushDeferredFractures(tick.world, tick.frame);
        assert.equal(tick.world.worldProps.filter((p) => p !== prop).length, 0);
    });
});
