import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { WorldProp } from "../Libraries/Props/props.js";
import { createKineticTestTick } from "./harness/kineticTickHarness.js";

describe("prop debris fade-out and removal", () => {
    it("does not fade out or die if fadeOutMs is not configured", () => {
        const prop = new WorldProp(0, 0, "box", 0);
        const tick = createKineticTestTick([prop]);
        assert.equal(prop.strategy.fadeOutMs, undefined);
        assert.equal(prop.alpha, 1);

        prop.update(3000, tick.world, tick.frame);
        assert.equal(prop.alpha, 1);
        assert.equal(prop.isDead, false);

        prop.update(10000, tick.world, tick.frame);
        assert.equal(prop.alpha, 1);
        assert.equal(prop.isDead, false);
    });

    it("removes prop from world simulation state when fade completes", () => {
        const prop = new WorldProp(0, 0, "wall_voxel_chunk", 0);
        const tick = createKineticTestTick([prop]);

        assert.ok(tick.world.worldProps.includes(prop));

        prop.update(3000, tick.world, tick.frame);
        assert.ok(tick.world.worldProps.includes(prop));
        assert.equal(prop.alpha, 1);
        assert.equal(prop.isDead, false);

        prop.update(2500, tick.world, tick.frame);
        assert.ok(tick.world.worldProps.includes(prop));
        assert.equal(prop.alpha, 0.5);
        assert.equal(prop.isDead, false);

        prop.update(1000, tick.world, tick.frame);
        assert.ok(!tick.world.worldProps.includes(prop));
        assert.equal(prop.isDead, true);
    });
});
