import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { WorldProp, applyPropBoxFootprint } from "../Libraries/Props/props.js";
import { createKineticTestTick } from "./harness/kineticTickHarness.js";
import { createFractureWorld } from "./harness/fractureHarness.js";
import { entityAlpha } from "../Core/engineMemory.js";
import { tickEntityFrames } from "../Libraries/Physics/physics.js";
import { KineticSpatialFrame } from "../Libraries/Spatial/spatial.js";

describe("prop debris fade-out and removal", () => {
    it("does not fade out or die if fadeOutMs is not configured", () => {
        const prop = new WorldProp(0, 0, "box", 0);
        const tick = createKineticTestTick([prop]);
        assert.equal(prop.strategy.fadeOutMs, undefined);
        assert.equal(prop.alpha, 1);

        tickEntityFrames(tick.frame, tick.world, 3000);
        assert.equal(prop.alpha, 1);
        assert.equal(prop.isDead, false);

        tickEntityFrames(tick.frame, tick.world, 10000);
        assert.equal(prop.alpha, 1);
        assert.equal(prop.isDead, false);
    });

    it("removes prop from world simulation state when fade completes", () => {
        const prop = new WorldProp(0, 0, "wall_voxel_chunk", 0);
        const tick = createKineticTestTick([prop]);

        assert.ok(tick.world.entityRegistry.getLive(prop.id));

        tickEntityFrames(tick.frame, tick.world, 3000);
        assert.ok(tick.world.entityRegistry.getLive(prop.id));
        assert.equal(prop.alpha, 1);
        assert.equal(prop.isDead, false);

        tickEntityFrames(tick.frame, tick.world, 2500);
        assert.ok(tick.world.entityRegistry.getLive(prop.id));
        assert.equal(prop.alpha, 0.5);
        assert.equal(prop.isDead, false);

        tickEntityFrames(tick.frame, tick.world, 1000);
        assert.ok(!tick.world.entityRegistry.getLive(prop.id));
        assert.equal(prop.isDead, true);
    });

    it("kinetic rail debris fades entityAlpha before despawn", () => {
        const world = createFractureWorld();
        const store = world.fractureEngine.debris;
        const body = store.acquireBody("wall_rail_chunk", 0, 0, 0);
        applyPropBoxFootprint(body, 8, 2);
        store._pushBody(body);
        const frame = new KineticSpatialFrame(16);
        frame.resetFrame(world.obstacleGrid);
        frame.admitKineticProps([body], world);
        const eid = body._physId;
        assert.equal(entityAlpha[eid], 1);
        assert.equal(body.strategy.fadeOutMs, 5000);
        assert.equal(body.strategy.fadeOutDurationMs, 1000);

        tickEntityFrames(frame, world, 5000);
        assert.equal(entityAlpha[eid], 1);
        assert.equal(body.isDead, false);
        assert.ok(store.list().includes(body));

        tickEntityFrames(frame, world, 500);
        assert.equal(entityAlpha[eid], 0.5);
        assert.equal(body.isDead, false);
        assert.ok(store.list().includes(body));

        tickEntityFrames(frame, world, 500);
        assert.equal(body.isDead, true);
        assert.ok(!store.list().includes(body));
    });
});
