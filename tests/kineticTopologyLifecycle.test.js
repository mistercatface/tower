import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CircleShape } from "../Libraries/Spatial/collision/Shapes.js";
import { KineticSpatialFrame } from "../Systems/World/KineticSpatialFrame.js";
import { kineticSpatial } from "../Systems/World/KineticSpatialFrame.js";
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

function createState(initialProps, constraints = []) {
    const worldProps = initialProps.slice();
    return {
        worldProps,
        sandbox: { kineticConstraints: constraints.slice(), kineticConstraintsDirty: false, kineticConstraintsVersion: 0, kineticTopologyGeneration: 0 },
        entityRegistry: {
            membershipGen: 0,
            register(_kind, prop) {
                if (!worldProps.includes(prop)) worldProps.push(prop);
            },
            unregister(prop) {
                const index = worldProps.indexOf(prop);
                if (index >= 0) worldProps.splice(index, 1);
            },
            getLive(id) {
                for (let i = 0; i < worldProps.length; i++) if (worldProps[i].id === id) return worldProps[i];
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
    frame._nextPhysId = bodies.length;
    return frame;
}

describe("kinetic topology lifecycle", () => {
    it("removeWorldPropFromState removes prop from the passed spatial frame", () => {
        const prop = mockCircleBody(0, 0, 10);
        const state = createState([prop]);
        const localFrame = setupActiveFrame([prop]);
        kineticSpatial._kineticBodies.length = 0;
        kineticSpatial._activeKineticBodies.length = 0;
        removeWorldPropFromState(state, prop, localFrame);
        assert.equal(prop._physId, undefined);
        assert.equal(localFrame._kineticBodies.length, 0);
        assert.equal(state.worldProps.length, 0);
    });

    it("stale pair gather generation rejects bodies after topology bump", () => {
        const a = mockCircleBody(0, 0, 10, 50, 0);
        const b = mockCircleBody(15, 0, 10, -30, 0);
        const state = createState([a, b]);
        const frame = setupActiveFrame([a, b]);
        stampKineticPairGatherTopology(frame, state);
        assert.ok(kineticPairBodiesAt(frame, state, 0, 1));
        frame.admitKineticProp(mockCircleBody(40, 0, 10), state);
        assert.equal(kineticPairBodiesAt(frame, state, 0, 1), null);
    });

    it("removeChainLinkBetween bumps topology and rebuilds island plan", () => {
        resetKineticConstraintIds(1);
        const a = mockCircleBody(0, 0, 10);
        const b = mockCircleBody(18, 0, 10);
        const c = mockCircleBody(36, 0, 10);
        const bodies = [a, b, c];
        const state = createState(bodies);
        addDistanceConstraint(state, { bodyAId: a.id, bodyBId: b.id, restLength: 18 });
        addDistanceConstraint(state, { bodyAId: b.id, bodyBId: c.id, restLength: 18 });
        const frame = setupActiveFrame(bodies);
        bakeKineticIslandPlan(state, frame._kineticBodies);
        assert.equal(a._kineticIslandPeers.length, 3);
        const genBefore = getKineticTopologyGeneration(state);
        removeChainLinkBetween(state, b.id, c.id);
        assert.ok(getKineticTopologyGeneration(state) > genBefore);
        ensureKineticIslandPlan(state, frame._kineticBodies);
        assert.equal(c._kineticIslandPeers, undefined);
        assert.equal(b._kineticLinkNeighbors.length, 1);
    });

    it("runCollisionPipeline does not reproduce glass after persisted pair gather", () => {
        const glass = new WorldProp(0, 0, "glass_pane", 0);
        const ball = new WorldProp(18, 0, "ball", 0);
        applyPropBoxFootprint(glass, 24, 18);
        ball.vx = -200;
        assert.ok(SatCollision.checkCollision(glass, glass.getShape(), ball, ball.getShape()));
        const state = createState([glass, ball]);
        const frame = setupActiveFrame([glass, ball]);
        runCollisionPipeline(state, frame, { resolveWalls() {} });
        assert.ok(state.worldProps.length > 2);
        assert.ok(!state.worldProps.includes(glass));
    });
});
