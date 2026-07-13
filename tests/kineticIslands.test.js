import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { addDistanceConstraint, ensureKineticIslandPlan, wakeKineticBody, LIBRARY_COLLISION_DEFAULTS, runKineticPhysics, createKineticSession, areKineticLinkNeighborsSlab } from "../Libraries/Physics/physics.js";
import { kineticDynamicSlab } from "../Core/engineMemory.js";
import { mockKineticCircle, resetMockKineticCircleIds, setupKineticTestFrame, createKineticTestTick, kineticPhysicsHooks } from "./harness/kineticTickHarness.js";

const SLEEP_FRAMES = LIBRARY_COLLISION_DEFAULTS.kineticSleepFrames;

function createState(props) {
    return {
        kinetic: createKineticSession(),
        sandbox: {},
        entityRegistry: {
            getLive(id) {
                for (let i = 0; i < props.length; i++) {
                    if (props[i].id === id) return props[i];
                }
                return null;
            },
        },
    };
}

function linkChain(state, bodies, spacing) {
    for (let i = 0; i < bodies.length - 1; i++) {
        addDistanceConstraint(state.kinetic, {
            bodyA: bodies[i],
            bodyB: bodies[i + 1],
            restLength: spacing,
        });
    }
}

describe("kinetic islands", () => {
    it("linked chain marks one-hop neighbors and skips adjacent contact pairs", () => {
        const left = mockKineticCircle(0, 0, 10, 0, 0);
        const center = mockKineticCircle(18, 0, 10, 25, 0);
        const right = mockKineticCircle(36, 0, 10, 0, 0);
        const bodies = [left, center, right];
        const tick = createKineticTestTick(bodies);
        linkChain(tick.world, bodies, 18);
        ensureKineticIslandPlan(tick.world.kinetic, tick.frame.kineticEids, tick.frame.kineticEidCount);
        assert.ok(areKineticLinkNeighborsSlab(left._physId, center._physId));
        assert.ok(areKineticLinkNeighborsSlab(center._physId, right._physId));
        assert.ok(!areKineticLinkNeighborsSlab(left._physId, right._physId));
        runKineticPhysics(tick, 16.667, kineticPhysicsHooks());
        assert.equal(tick.world.kinetic.kineticSolverStats.pairCount, 0);
    });

    it("folded linked chain still contacts non-adjacent overlapping bodies", () => {
        const left = mockKineticCircle(0, 0, 10, 5, 0);
        const center = mockKineticCircle(18, 0, 10, 0, 0);
        const right = mockKineticCircle(5, 0, 10, 0, 0);
        const bodies = [left, center, right];
        const tick = createKineticTestTick(bodies);
        linkChain(tick.world, bodies, 18);
        runKineticPhysics(tick, 16.667, kineticPhysicsHooks());
        assert.ok(tick.world.kinetic.kineticSolverStats.pairCount >= 1);
    });

    it("unlinked chain still emits moving-body pairs", () => {
        const left = mockKineticCircle(0, 0, 10, 0, 0);
        const center = mockKineticCircle(18, 0, 10, 25, 0);
        const right = mockKineticCircle(36, 0, 10, 0, 0);
        const tick = createKineticTestTick([left, center, right]);
        runKineticPhysics(tick, 16.667, kineticPhysicsHooks());
        assert.ok(tick.world.kinetic.kineticSolverStats.pairCount >= 1);
    });

    it("linked chain generates far fewer pairs than free balls for the same layout", () => {
        const spacing = 18;
        const count = 10;
        const bodies = [];
        for (let i = 0; i < count; i++) bodies.push(mockKineticCircle(i * spacing, 0, 10, i === 5 ? 20 : 0, 0));
        const linkedTick = createKineticTestTick(bodies);
        linkChain(linkedTick.world, bodies, spacing);
        runKineticPhysics(linkedTick, 16.667, kineticPhysicsHooks());
        const linkedPairs = linkedTick.world.kinetic.kineticSolverStats.pairCount;

        resetMockKineticCircleIds(100);
        const freeBodies = [];
        for (let i = 0; i < count; i++) freeBodies.push(mockKineticCircle(i * spacing, 0, 10, i === 5 ? 20 : 0, 0));
        const freeTick = createKineticTestTick(freeBodies);
        runKineticPhysics(freeTick, 16.667, kineticPhysicsHooks());
        assert.ok(linkedPairs < freeTick.world.kinetic.kineticSolverStats.pairCount);
        assert.equal(linkedPairs, 0);
    });

    it("resting linked chain sleeps as one island", () => {
        const spacing = 18;
        const count = 20;
        const bodies = [];
        for (let i = 0; i < count; i++) bodies.push(mockKineticCircle(i * spacing, 0, 10, 0, 0));
        const tick = createKineticTestTick(bodies);
        linkChain(tick.world, bodies, spacing);
        for (let pass = 0; pass < SLEEP_FRAMES; pass++) runKineticPhysics(tick, 16.667, kineticPhysicsHooks());
        for (let i = 0; i < bodies.length; i++) assert.equal(bodies[i].isSleeping, true);
        assert.equal(kineticDynamicSlab.islandRoot[bodies[0]._physId], bodies[0].id);
        assert.equal(kineticDynamicSlab.islandRoot[bodies[count - 1]._physId], bodies[0].id);
    });

    it("waking the head wakes direct link neighbors only", () => {
        const a = mockKineticCircle(0, 0, 10, 0, 0);
        const b = mockKineticCircle(18, 0, 10, 0, 0);
        const c = mockKineticCircle(36, 0, 10, 0, 0);
        const bodies = [a, b, c];
        const state = createState(bodies);
        linkChain(state, bodies, 18);
        const frame = setupKineticTestFrame(bodies);
        ensureKineticIslandPlan(state.kinetic, frame.kineticEids, frame.kineticEidCount);
        for (let i = 0; i < bodies.length; i++) {
            bodies[i].isSleeping = true;
            bodies[i]._sleepFrames = SLEEP_FRAMES;
        }
        wakeKineticBody(a._physId);
        assert.equal(a.isSleeping, false);
        assert.equal(b.isSleeping, false);
        assert.equal(c.isSleeping, true);
    });

    it("ensureKineticIslandPlan assigns one-hop link neighbors", () => {
        const a = mockKineticCircle(0, 0, 10);
        const b = mockKineticCircle(18, 0, 10);
        const c = mockKineticCircle(36, 0, 10);
        const bodies = [a, b, c];
        const state = createState(bodies);
        linkChain(state, bodies, 18);
        const frame = setupKineticTestFrame(bodies);
        ensureKineticIslandPlan(state.kinetic, frame.kineticEids, frame.kineticEidCount);
        assert.equal(kineticDynamicSlab.linkNeighborCount[a._physId], 1);
        assert.equal(kineticDynamicSlab.linkNeighborEids[kineticDynamicSlab.linkNeighborOffset[a._physId]], b._physId);
        assert.equal(kineticDynamicSlab.linkNeighborCount[b._physId], 2);
        assert.equal(kineticDynamicSlab.linkNeighborCount[c._physId], 1);
        assert.equal(kineticDynamicSlab.linkNeighborEids[kineticDynamicSlab.linkNeighborOffset[c._physId]], b._physId);
    });

    it("ensureKineticIslandPlan fills islandRoot for in-frame bodies", () => {
        const a = mockKineticCircle(0, 0, 10);
        const b = mockKineticCircle(18, 0, 10);
        const c = mockKineticCircle(36, 0, 10);
        const bodies = [a, b, c];
        const state = createState(bodies);
        linkChain(state, bodies, 18);
        const frame = setupKineticTestFrame(bodies);
        ensureKineticIslandPlan(state.kinetic, frame.kineticEids, frame.kineticEidCount);
        assert.equal(kineticDynamicSlab.islandRoot[a._physId], a.id);
        assert.equal(kineticDynamicSlab.islandRoot[b._physId], a.id);
        assert.equal(kineticDynamicSlab.islandRoot[c._physId], a.id);
    });

    it("addDistanceConstraint marks island topology dirty", () => {
        const a = mockKineticCircle(0, 0, 10);
        const b = mockKineticCircle(18, 0, 10);
        const state = createState([a, b]);
        state.kinetic.kineticConstraintsDirty = false;
        addDistanceConstraint(state.kinetic, { bodyA: a, bodyB: b, restLength: 18 });
        assert.equal(state.kinetic.kineticConstraintsDirty, true);
    });

    it("unlinked resting crate pile/contact-island sleeps together after consecutive still frames", () => {
        resetMockKineticCircleIds(1);
        const a = mockKineticCircle(0, 0, 10, 0, 0);
        const b = mockKineticCircle(0, 18, 10, 0, 0);
        const c = mockKineticCircle(0, 36, 10, 0, 0);
        const bodies = [a, b, c];
        const tick = createKineticTestTick(bodies);
        for (let frame = 0; frame < SLEEP_FRAMES; frame++) {
            runKineticPhysics(tick, 16.667, kineticPhysicsHooks());
        }
        assert.equal(a.isSleeping, true);
        assert.equal(b.isSleeping, true);
        assert.equal(c.isSleeping, true);
    });

    it("active overlapping neighbor wakes sleeping body and prevents sleep", () => {
        resetMockKineticCircleIds(10);
        const a = mockKineticCircle(0, 0, 10, 0, 0);
        const b = mockKineticCircle(0, 18, 10, 5, 0);
        const bodies = [a, b];
        const tick = createKineticTestTick(bodies);
        a.isSleeping = true;
        a._sleepFrames = SLEEP_FRAMES;
        tick.frame.syncActiveKineticBodies();
        assert.equal(a.isSleeping, true);
        assert.equal(b.isSleeping, false);
        runKineticPhysics(tick, 16.667, kineticPhysicsHooks());
        assert.equal(a.isSleeping, false);
        assert.equal(a._sleepFrames, 0);
        assert.equal(b.isSleeping, false);
    });
});
