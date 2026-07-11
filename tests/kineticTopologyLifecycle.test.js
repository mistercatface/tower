import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { kineticSpatial } from "../Libraries/Spatial/spatial.js";
import { createKineticTestTick, createKineticTestWorld, mockKineticCircle, setupKineticTestFrame } from "./harness/kineticTickHarness.js";
import { addDistanceConstraint } from "../Libraries/Physics/physics.js";
import { bakeKineticIslandPlan, ensureKineticIslandPlan } from "../Libraries/Physics/physics.js";
import { kineticDynamicSlab } from "../Core/engineMemory.js";
import { getKineticTopologyGeneration, stampKineticPairGatherTopology, kineticPairTopologyStale } from "../Libraries/Physics/physics.js";
import { removeWorldPropFromState } from "../GameState/EntityRegistry.js";
import { entityRefs } from "../Core/engineMemory.js";
import { removeChainLinkBetween } from "../Libraries/Sandbox/sandbox.js";
import { runCollisionPipeline } from "../Libraries/Physics/physics.js";
import { WorldProp } from "../Libraries/Props/props.js";
import { applyPropBoxFootprint } from "../Libraries/Props/props.js";
import { satCheckCollision, entityFacing } from "../Libraries/Physics/physics.js";
import { resolveKineticContactPassWithEffects } from "./harness/kineticContactHarness.js";
import { liveGlassCount } from "./harness/fractureHarness.js";

function createTestWorld(initialProps) {
    return createKineticTestWorld(initialProps, { constraintsDirty: false });
}

function chainLinkState(world) {
    return { ...world, sandbox: {} };
}

describe("kinetic topology lifecycle", () => {
    it("removeWorldPropFromState removes prop from the passed spatial frame", () => {
        const prop = mockKineticCircle(0, 0, 10);
        const world = createTestWorld([prop]);
        const localFrame = setupKineticTestFrame([prop]);
        kineticSpatial._kineticBodies.length = 0;
        kineticSpatial._activeKineticBodies.length = 0;
        removeWorldPropFromState(world, prop, localFrame);
        assert.equal(prop._physId, undefined);
        assert.equal(localFrame._kineticBodies.length, 0);
        assert.equal(world.worldProps.length, 0);
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

    it("contact side effects still fracture glass after topology bump", () => {
        const glass = new WorldProp(0, 0, "glass_pane", 0);
        const ball = new WorldProp(18, 0, "ball", 0);
        applyPropBoxFootprint(glass, 24, 18);
        ball.vx = -200;
        const tick = createKineticTestTick([glass, ball]);
        stampKineticPairGatherTopology(tick.frame, tick.world.kinetic);
        tick.frame.admitKineticProps([mockKineticCircle(40, 0, 10)], tick.world);
        assert.equal((kineticPairTopologyStale(tick.frame) ? null : ((tick.entityRefs[glass._physId]?._physId === glass._physId && tick.entityRefs[ball._physId]?._physId === ball._physId) ? { bodyA: tick.entityRefs[glass._physId], bodyB: tick.entityRefs[ball._physId] } : null)), null);
        resolveKineticContactPassWithEffects(tick);
        assert.ok(liveGlassCount(tick.world) > 2);
        assert.ok(!tick.world.worldProps.includes(glass) || glass._fractureCooldown > 0);
    });

    it("removeChainLinkBetween bumps topology and rebuilds island plan", () => {
        const a = mockKineticCircle(0, 0, 10);
        const b = mockKineticCircle(18, 0, 10);
        const c = mockKineticCircle(36, 0, 10);
        const bodies = [a, b, c];
        const world = createTestWorld(bodies);
        const state = chainLinkState(world);
        addDistanceConstraint(world.kinetic, { bodyA: a, bodyB: b, restLength: 18 });
        addDistanceConstraint(world.kinetic, { bodyA: b, bodyB: c, restLength: 18 });
        const frame = setupKineticTestFrame(bodies);
        bakeKineticIslandPlan(world.kinetic, frame._kineticBodies);
        assert.equal(a._kineticIslandPeers.length, 3);
        const genBefore = getKineticTopologyGeneration(world.kinetic);
        removeChainLinkBetween(state, b.id, c.id);
        assert.ok(getKineticTopologyGeneration(world.kinetic) > genBefore);
        ensureKineticIslandPlan(world.kinetic, frame._kineticBodies);
        assert.equal(c._kineticIslandPeers, undefined);
        assert.equal(kineticDynamicSlab.linkNeighborCount[b._physId], 1);
    });

    it("runCollisionPipeline does not reproduce glass after persisted pair gather", () => {
        const glass = new WorldProp(0, 0, "glass_pane", 0);
        const ball = new WorldProp(18, 0, "ball", 0);
        applyPropBoxFootprint(glass, 24, 18);
        ball.vx = -200;
        assert.ok(satCheckCollision(glass.x, glass.y, entityFacing(glass), glass.shape, ball.x, ball.y, entityFacing(ball), ball.shape));
        const tick = createKineticTestTick([glass, ball]);
        runCollisionPipeline(tick, () => {}, (t, c) => t.world.fractureEngine.processKineticContactFractures(t, c));
        assert.ok(liveGlassCount(tick.world) > 2);
        assert.ok(!tick.world.worldProps.includes(glass) || glass._fractureCooldown > 0);
    });
});
