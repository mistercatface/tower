import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { kineticSpatial } from "../Libraries/Spatial/spatial.js";
import { createKineticTestTick, createKineticTestWorld, mockKineticCircle, setupKineticTestFrame } from "./harness/kineticTickHarness.js";
import { addDistanceConstraint, clearKineticConstraints } from "../Libraries/Physics/physics.js";
import { ensureKineticIslandPlan, clearActiveKineticBodySlab } from "../Libraries/Physics/physics.js";
import { kineticDynamicSlab } from "../Core/engineMemory.js";
import { getKineticTopologyGeneration, stampKineticPairGatherTopology, kineticPairTopologyStale } from "../Libraries/Physics/physics.js";
import { removeWorldPropFromState } from "../GameState/EntityRegistry.js";
import { entityRefs } from "../Core/engineMemory.js";
import { runCollisionPipeline } from "../Libraries/Physics/physics.js";
import { WorldProp } from "../Libraries/Props/props.js";
import { applyPropBoxFootprint } from "../Libraries/Props/props.js";
import { satCheckCollision } from "./harness/satCollisionHarness.js";
import { resolveKineticContactPassWithEffects } from "./harness/kineticContactHarness.js";
import { liveFracturePropCount, liveWorldPropCount } from "./harness/fractureHarness.js";

function createTestWorld(initialProps) {
    return createKineticTestWorld(initialProps, { constraintsDirty: false });
}

describe("kinetic topology lifecycle", () => {
    it("removeWorldPropFromState removes prop from the passed spatial frame", () => {
        const prop = mockKineticCircle(0, 0, 10);
        const world = createTestWorld([prop]);
        const localFrame = setupKineticTestFrame([prop]);
        kineticSpatial.kineticEidCount = 0;
        clearActiveKineticBodySlab() /* was active list clear */;
        removeWorldPropFromState(world, prop, localFrame);
        assert.equal(prop._physId, undefined);
        assert.equal(localFrame.kineticEidCount, 0);
        assert.equal(liveWorldPropCount(world.entityRegistry), 0);
    });

    it("stale pair gather generation rejects bodies after topology bump", () => {
        const a = mockKineticCircle(0, 0, 10, 50, 0);
        const b = mockKineticCircle(15, 0, 10, -30, 0);
        const world = createTestWorld([a, b]);
        const frame = setupKineticTestFrame([a, b]);
        stampKineticPairGatherTopology(frame, world.kinetic);
        assert.ok((kineticPairTopologyStale(frame) ? null : ((entityRefs[0]?._physId === 0 && entityRefs[1]?._physId === 1) ? { bodyA: entityRefs[0], bodyB: entityRefs[1] } : null)));
        frame.admitKineticProps([mockKineticCircle(40, 0, 10)], world);
        assert.equal((kineticPairTopologyStale(frame) ? null : ((entityRefs[0]?._physId === 0 && entityRefs[1]?._physId === 1) ? { bodyA: entityRefs[0], bodyB: entityRefs[1] } : null)), null);
    });

    it("contact side effects still fracture after topology bump", () => {
        const glass = new WorldProp(0, 0, "box", 0);
        glass.fractureEnabled = true;
        const ball = new WorldProp(18, 0, "ball", 0);
        applyPropBoxFootprint(glass, 24, 18);
        ball.vx = -200;
        const tick = createKineticTestTick([glass, ball]);
        stampKineticPairGatherTopology(tick.frame, tick.world.kinetic);
        tick.frame.admitKineticProps([mockKineticCircle(40, 0, 10)], tick.world);
        assert.equal((kineticPairTopologyStale(tick.frame) ? null : ((tick.entityRefs[glass._physId]?._physId === glass._physId && tick.entityRefs[ball._physId]?._physId === ball._physId) ? { bodyA: tick.entityRefs[glass._physId], bodyB: tick.entityRefs[ball._physId] } : null)), null);
        resolveKineticContactPassWithEffects(tick);
        assert.ok(liveFracturePropCount(tick.world) > 2);
        assert.ok(!tick.world.entityRegistry.getLive(glass.id) || glass._fractureCooldown > 0);
    });

    it("clearing and re-adding a link bumps topology and rebuilds island plan", () => {
        const a = mockKineticCircle(0, 0, 10);
        const b = mockKineticCircle(18, 0, 10);
        const c = mockKineticCircle(36, 0, 10);
        const bodies = [a, b, c];
        const world = createTestWorld(bodies);
        const frame = setupKineticTestFrame(bodies);
        addDistanceConstraint(world.kinetic, 0, 1, { restLength: 18 });
        addDistanceConstraint(world.kinetic, 1, 2, { restLength: 18 });
        ensureKineticIslandPlan(world.kinetic, frame.kineticEids, frame.kineticEidCount);
        assert.equal(kineticDynamicSlab.islandRoot[0], a.id);
        assert.equal(kineticDynamicSlab.islandRoot[2], a.id);
        const genBefore = getKineticTopologyGeneration(world.kinetic);
        clearKineticConstraints(world.kinetic);
        addDistanceConstraint(world.kinetic, 0, 1, { restLength: 18 });
        assert.ok(getKineticTopologyGeneration(world.kinetic) > genBefore);
        ensureKineticIslandPlan(world.kinetic, frame.kineticEids, frame.kineticEidCount);
        assert.notEqual(kineticDynamicSlab.islandRoot[2], kineticDynamicSlab.islandRoot[0]);
        assert.equal(kineticDynamicSlab.linkNeighborCount[1], 1);
    });

    it("runCollisionPipeline does not reproduce fracture after persisted pair gather", () => {
        const glass = new WorldProp(0, 0, "box", 0);
        glass.fractureEnabled = true;
        const ball = new WorldProp(18, 0, "ball", 0);
        applyPropBoxFootprint(glass, 24, 18);
        ball.vx = -200;
        const tick = createKineticTestTick([glass, ball]);
        assert.ok(satCheckCollision(glass, ball));
        runCollisionPipeline(tick, () => {}, (t, c) => t.world.fractureEngine.processKineticContactFractures(t, c));
        assert.ok(liveFracturePropCount(tick.world) > 2);
        assert.ok(!tick.world.entityRegistry.getLive(glass.id) || glass._fractureCooldown > 0);
    });
});
