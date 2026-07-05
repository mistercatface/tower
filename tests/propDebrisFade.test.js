import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { WorldProp } from "../Libraries/Props/props.js";
import { createKineticTestTick } from "./harness/kineticTickHarness.js";

describe("prop debris fade-out and removal", () => {
    it("does not fade out or die if fadeOutMs is not configured", () => {
        const prop = new WorldProp(0, 0, "glass_pane", 0);
        assert.equal(prop.strategy.fadeOutMs, undefined);
        assert.equal(prop.alpha, undefined);

        prop.update(3000);
        assert.equal(prop.alpha, undefined);
        assert.equal(prop.isDead, false);

        prop.update(10000);
        assert.equal(prop.alpha, undefined);
        assert.equal(prop.isDead, false);
    });

    it("calculates alpha correctly and marks dead if state/spatialFrame is missing", () => {
        const prop = new WorldProp(0, 0, "wall_voxel_chunk", 0);
        assert.equal(prop.strategy.fadeOutMs, 5000);
        assert.equal(prop.strategy.fadeOutDurationMs, 1000);

        prop.update(3000);
        assert.equal(prop.alpha, 1);
        assert.equal(prop.isDead, false);

        prop.update(2500);
        assert.equal(prop.alpha, 0.5);
        assert.equal(prop.isDead, false);

        prop.update(1000);
        assert.equal(prop.isDead, true);
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
