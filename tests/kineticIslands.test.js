import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CircleShape } from "../Libraries/Spatial/collision/Shapes.js";
import { KineticSpatialFrame } from "../Systems/World/KineticSpatialFrame.js";
import { createKineticSession } from "../GameState/KineticSession.js";
import { addDistanceConstraint, resetKineticConstraintIds } from "../Libraries/Motion/kineticConstraints.js";
import { bakeKineticIslandPlan, islandRootByPhysId, shareKineticIsland } from "../Libraries/Motion/kineticIslands.js";
import {
    advanceKineticSleep,
    evaluateKineticIslandSleepEligible,
    wakeKineticBody,
} from "../Libraries/Motion/kineticSleep.js";
import { LIBRARY_COLLISION_DEFAULTS } from "../Libraries/Collision/collisionDefaults.js";
import { snapshotActiveBroadphaseBounds } from "../Libraries/Spatial/collision/entityBroadphase.js";
import { gatherKineticCandidatePairs, kineticPairBuffer } from "../Libraries/Spatial/collision/kineticPairStream.js";

let nextId = 1;
const SLEEP_FRAMES = LIBRARY_COLLISION_DEFAULTS.kineticSleep.frames;

function mockCircleBody(x, y, radius, vx = 0, vy = 0) {
    return {
        id: nextId++,
        x,
        y,
        radius,
        vx,
        vy,
        angularVelocity: 0,
        isSleeping: false,
        _sleepFrames: 0,
        strategy: { isKinetic: true },
        mass: radius,
        get momentOfInertia() {
            return this.mass * this.radius * this.radius * 0.5;
        },
        getShape() {
            return new CircleShape(this.radius);
        },
    };
}

function createState(props, constraints = []) {
    return {
        kinetic: createKineticSession({ constraints }),
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

function setupActiveFrame(bodies) {
    const frame = new KineticSpatialFrame(50);
    frame.resetFrame({ minX: -500, maxX: 500, minY: -500, maxY: 500 });
    for (let i = 0; i < bodies.length; i++) {
        frame.insertEntity(bodies[i], i);
        bodies[i]._physId = i;
    }
    frame._kineticBodies = bodies.slice();
    frame._activeKineticBodies = bodies.slice();
    return frame;
}

function linkChain(state, bodies, spacing) {
    resetKineticConstraintIds(1);
    for (let i = 0; i < bodies.length - 1; i++) {
        addDistanceConstraint(state.kinetic, {
            bodyA: bodies[i],
            bodyB: bodies[i + 1],
            restLength: spacing,
        });
    }
}

describe("kinetic islands", () => {
    it("linked chain skips internal candidate pairs", () => {
        const left = mockCircleBody(0, 0, 10, 0, 0);
        const center = mockCircleBody(18, 0, 10, 25, 0);
        const right = mockCircleBody(36, 0, 10, 0, 0);
        const bodies = [left, center, right];
        const state = createState(bodies);
        linkChain(state, bodies, 18);
        const frame = setupActiveFrame(bodies);
        bakeKineticIslandPlan(state.kinetic, frame._kineticBodies);
        snapshotActiveBroadphaseBounds(frame._activeKineticBodies);
        gatherKineticCandidatePairs(frame, kineticPairBuffer);
        assert.equal(kineticPairBuffer.count, 0);
    });

    it("unlinked chain still emits moving-body pairs", () => {
        const left = mockCircleBody(0, 0, 10, 0, 0);
        const center = mockCircleBody(18, 0, 10, 25, 0);
        const right = mockCircleBody(36, 0, 10, 0, 0);
        const bodies = [left, center, right];
        const state = createState(bodies);
        const frame = setupActiveFrame(bodies);
        bakeKineticIslandPlan(state.kinetic, frame._kineticBodies);
        snapshotActiveBroadphaseBounds(frame._activeKineticBodies);
        gatherKineticCandidatePairs(frame, kineticPairBuffer);
        assert.equal(kineticPairBuffer.count, 2);
    });

    it("linked chain generates far fewer pairs than free balls for the same layout", () => {
        const spacing = 18;
        const count = 10;
        const bodies = [];
        for (let i = 0; i < count; i++) bodies.push(mockCircleBody(i * spacing, 0, 10, i === 5 ? 20 : 0, 0));
        const linkedState = createState(bodies);
        linkChain(linkedState, bodies, spacing);
        const linkedFrame = setupActiveFrame(bodies);
        bakeKineticIslandPlan(linkedState.kinetic, linkedFrame._kineticBodies);
        snapshotActiveBroadphaseBounds(linkedFrame._activeKineticBodies);
        gatherKineticCandidatePairs(linkedFrame, kineticPairBuffer);
        const linkedPairs = kineticPairBuffer.count;

        nextId = 100;
        const freeBodies = [];
        for (let i = 0; i < count; i++) freeBodies.push(mockCircleBody(i * spacing, 0, 10, i === 5 ? 20 : 0, 0));
        const freeState = createState(freeBodies);
        const freeFrame = setupActiveFrame(freeBodies);
        bakeKineticIslandPlan(freeState.kinetic, freeFrame._kineticBodies);
        snapshotActiveBroadphaseBounds(freeFrame._activeKineticBodies);
        gatherKineticCandidatePairs(freeFrame, kineticPairBuffer);
        assert.ok(linkedPairs < kineticPairBuffer.count);
        assert.equal(linkedPairs, 0);
    });

    it("resting linked chain sleeps as one island", () => {
        const spacing = 18;
        const count = 20;
        const bodies = [];
        for (let i = 0; i < count; i++) bodies.push(mockCircleBody(i * spacing, 0, 10, 0, 0));
        const state = createState(bodies);
        linkChain(state, bodies, spacing);
        const frame = setupActiveFrame(bodies);
        bakeKineticIslandPlan(state.kinetic, frame._kineticBodies);
        assert.ok(shareKineticIsland(bodies[0], bodies[1]));
        const islandMembers = bodies[0]._kineticIslandPeers;
        assert.equal(islandMembers.length, count);
        assert.ok(evaluateKineticIslandSleepEligible(islandMembers, frame));
        for (let pass = 0; pass < SLEEP_FRAMES; pass++) {
            for (let i = 0; i < islandMembers.length; i++) advanceKineticSleep(islandMembers[i], true);
        }
        for (let i = 0; i < bodies.length; i++) assert.equal(bodies[i].isSleeping, true);
    });

    it("waking the head wakes direct link neighbors only", () => {
        const a = mockCircleBody(0, 0, 10, 0, 0);
        const b = mockCircleBody(18, 0, 10, 0, 0);
        const c = mockCircleBody(36, 0, 10, 0, 0);
        const bodies = [a, b, c];
        const state = createState(bodies);
        linkChain(state, bodies, 18);
        bakeKineticIslandPlan(state.kinetic, bodies);
        for (let i = 0; i < bodies.length; i++) {
            bodies[i].isSleeping = true;
            bodies[i]._sleepFrames = SLEEP_FRAMES;
        }
        wakeKineticBody(a);
        assert.equal(a.isSleeping, false);
        assert.equal(b.isSleeping, false);
        assert.equal(c.isSleeping, true);
    });

    it("bakeKineticIslandPlan assigns one-hop link neighbors", () => {
        const a = mockCircleBody(0, 0, 10);
        const b = mockCircleBody(18, 0, 10);
        const c = mockCircleBody(36, 0, 10);
        const bodies = [a, b, c];
        const state = createState(bodies);
        linkChain(state, bodies, 18);
        bakeKineticIslandPlan(state.kinetic, bodies);
        assert.equal(a._kineticLinkNeighbors.length, 1);
        assert.equal(a._kineticLinkNeighbors[0], b);
        assert.equal(b._kineticLinkNeighbors.length, 2);
        assert.equal(c._kineticLinkNeighbors.length, 1);
        assert.equal(c._kineticLinkNeighbors[0], b);
    });

    it("bakeKineticIslandPlan fills islandRootByPhysId for in-frame bodies", () => {
        const a = mockCircleBody(0, 0, 10);
        const b = mockCircleBody(18, 0, 10);
        const c = mockCircleBody(36, 0, 10);
        const bodies = [a, b, c];
        const state = createState(bodies);
        linkChain(state, bodies, 18);
        const frame = setupActiveFrame(bodies);
        bakeKineticIslandPlan(state.kinetic, frame._kineticBodies);
        assert.equal(islandRootByPhysId[a._physId], a.id);
        assert.equal(islandRootByPhysId[b._physId], a.id);
        assert.equal(islandRootByPhysId[c._physId], a.id);
    });

    it("addDistanceConstraint marks island topology dirty", () => {
        resetKineticConstraintIds(1);
        const a = mockCircleBody(0, 0, 10);
        const b = mockCircleBody(18, 0, 10);
        const state = createState([a, b]);
        state.kinetic.kineticConstraintsDirty = false;
        addDistanceConstraint(state.kinetic, { bodyA: a, bodyB: b, restLength: 18 });
        assert.equal(state.kinetic.kineticConstraintsDirty, true);
    });
});
