import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CircleShape } from "../Libraries/Spatial/collision/Shapes.js";
import { kineticSpatial } from "../Systems/World/KineticSpatialFrame.js";
import { createKineticTick } from "../GameState/KineticTick.js";
import { createKineticTestWorld, setupKineticTestFrame } from "./harness/kineticTickHarness.js";
import { addDistanceConstraint, resetKineticConstraintIds } from "../Libraries/Motion/kineticConstraints.js";
import { bakeKineticIslandPlan, ensureKineticIslandPlan } from "../Libraries/Motion/kineticIslands.js";
import { getKineticTopologyGeneration, stampKineticPairGatherTopology } from "../Libraries/Motion/kineticTopology.js";
import { kineticPairBodiesAt } from "../Libraries/Spatial/collision/kineticPairStream.js";
import { removeWorldPropFromState } from "../GameState/EntityRegistry.js";
import { removeChainLinkBetween } from "../Libraries/Sandbox/chainLinks.js";
import { runCollisionPipeline } from "../Libraries/Spatial/collision/collisionPipeline.js";
import { loadPropAssets } from "../Libraries/Props/loadPropAssets.js";
import { WorldProp } from "../Entities/WorldProp.js";
import { applyPropBoxFootprint } from "../Libraries/Props/propStrategy.js";
import { SatCollision } from "../Libraries/Spatial/collision/SatCollision.js";

loadPropAssets();

let nextId = 1;

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

function createTestWorld(initialProps, constraints = []) {
    return createKineticTestWorld(initialProps, { constraints, constraintsDirty: false });
}

function chainLinkState(world) {
    return { ...world, sandbox: {} };
}

describe("kinetic topology lifecycle", () => {
    it("removeWorldPropFromState removes prop from the passed spatial frame", () => {
        const prop = mockCircleBody(0, 0, 10);
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
        const a = mockCircleBody(0, 0, 10, 50, 0);
        const b = mockCircleBody(15, 0, 10, -30, 0);
        const world = createTestWorld([a, b]);
        const frame = setupKineticTestFrame([a, b]);
        stampKineticPairGatherTopology(frame, world.kinetic);
        assert.ok(kineticPairBodiesAt(frame, 0, 1));
        frame.admitKineticProp(mockCircleBody(40, 0, 10), world);
        assert.equal(kineticPairBodiesAt(frame, 0, 1), null);
    });

    it("removeChainLinkBetween bumps topology and rebuilds island plan", () => {
        resetKineticConstraintIds(1);
        const a = mockCircleBody(0, 0, 10);
        const b = mockCircleBody(18, 0, 10);
        const c = mockCircleBody(36, 0, 10);
        const bodies = [a, b, c];
        const world = createTestWorld(bodies);
        const state = chainLinkState(world);
        addDistanceConstraint(world.kinetic, { bodyAId: a.id, bodyBId: b.id, restLength: 18 });
        addDistanceConstraint(world.kinetic, { bodyAId: b.id, bodyBId: c.id, restLength: 18 });
        const frame = setupKineticTestFrame(bodies);
        bakeKineticIslandPlan(world.kinetic, frame._kineticBodies);
        assert.equal(a._kineticIslandPeers.length, 3);
        const genBefore = getKineticTopologyGeneration(world.kinetic);
        removeChainLinkBetween(state, b.id, c.id);
        assert.ok(getKineticTopologyGeneration(world.kinetic) > genBefore);
        ensureKineticIslandPlan(world.kinetic, frame._kineticBodies);
        assert.equal(c._kineticIslandPeers, undefined);
        assert.equal(b._kineticLinkNeighbors.length, 1);
    });

    it("runCollisionPipeline does not reproduce glass after persisted pair gather", () => {
        const glass = new WorldProp(0, 0, "glass_pane", 0);
        const ball = new WorldProp(18, 0, "ball", 0);
        applyPropBoxFootprint(glass, 24, 18);
        ball.vx = -200;
        assert.ok(SatCollision.checkCollision(glass, glass.getShape(), ball, ball.getShape()));
        const world = createTestWorld([glass, ball]);
        const frame = setupKineticTestFrame([glass, ball]);
        runCollisionPipeline(createKineticTick(frame, world), { resolveWalls() {} });
        assert.ok(world.worldProps.length > 2);
        assert.ok(!world.worldProps.includes(glass));
    });
});
