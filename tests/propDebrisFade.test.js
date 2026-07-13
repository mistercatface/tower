import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { WorldProp, applyPropBoxFootprint } from "../Libraries/Props/props.js";
import { createKineticTestTick } from "./harness/kineticTickHarness.js";
import { createFractureWorld } from "./harness/fractureHarness.js";
import { assignPhysIdWithPose } from "./harness/kineticTickHarness.js";
import { entityAlpha } from "../Core/engineMemory.js";

describe("prop debris fade-out and removal", () => {
    it("does not fade out or die if fadeOutMs is not configured", () => {
        const prop = new WorldProp(0, 0, "box", 0);
        const tick = createKineticTestTick([prop]);
        assert.equal(prop.strategy.fadeOutMs, undefined);
        assert.equal(prop.alpha, 1);

        prop.tickPropFrame(3000, tick.world, tick.frame);
        assert.equal(prop.alpha, 1);
        assert.equal(prop.isDead, false);

        prop.tickPropFrame(10000, tick.world, tick.frame);
        assert.equal(prop.alpha, 1);
        assert.equal(prop.isDead, false);
    });

    it("removes prop from world simulation state when fade completes", () => {
        const prop = new WorldProp(0, 0, "wall_voxel_chunk", 0);
        const tick = createKineticTestTick([prop]);

        assert.ok(tick.world.entityRegistry.getLive(prop.id));

        prop.tickPropFrame(3000, tick.world, tick.frame);
        assert.ok(tick.world.entityRegistry.getLive(prop.id));
        assert.equal(prop.alpha, 1);
        assert.equal(prop.isDead, false);

        prop.tickPropFrame(2500, tick.world, tick.frame);
        assert.ok(tick.world.entityRegistry.getLive(prop.id));
        assert.equal(prop.alpha, 0.5);
        assert.equal(prop.isDead, false);

        prop.tickPropFrame(1000, tick.world, tick.frame);
        assert.ok(!tick.world.entityRegistry.getLive(prop.id));
        assert.equal(prop.isDead, true);
    });

    it("kinetic rail debris fades entityAlpha before despawn", () => {
        const world = createFractureWorld();
        const store = world.fractureEngine.debris;
        const body = store.acquireBody("wall_rail_chunk", 0, 0, 0);
        applyPropBoxFootprint(body, 8, 2);
        assignPhysIdWithPose(body, 42);
        store._pushBody(body);
        const eid = body._physId;
        assert.equal(entityAlpha[eid], 1);
        assert.equal(body.strategy.fadeOutMs, 5000);
        assert.equal(body.strategy.fadeOutDurationMs, 1000);

        body.tickPropFrame(5000, world, world.spatialFrame);
        assert.equal(entityAlpha[eid], 1);
        assert.equal(body.isDead, false);
        assert.ok(store.list().includes(body));

        body.tickPropFrame(500, world, world.spatialFrame);
        assert.equal(entityAlpha[eid], 0.5);
        assert.equal(body.isDead, false);
        assert.ok(store.list().includes(body));

        body.tickPropFrame(500, world, world.spatialFrame);
        assert.equal(body.isDead, true);
        assert.ok(!store.list().includes(body));
    });
});
