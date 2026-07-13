import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getConnectedBodyIds, addDistanceConstraint, createKineticSession } from "../Libraries/Physics/physics.js";
import { mockBall, resetMockBallIds, assignPhysIdWithPose } from "./harness/kineticTickHarness.js";
import { kineticConstraintStore } from "../Core/engineMemory.js";

function createState(props) {
    for (let i = 0; i < props.length; i++) {
        if (props[i]._physId === undefined) assignPhysIdWithPose(props[i], i);
    }
    return {
        kinetic: createKineticSession(),
        entityRegistry: {
            getLive(id) {
                for (let i = 0; i < props.length; i++) if (props[i].id === id) return props[i];
                return null;
            },
        },
    };
}

describe("chain links", () => {
    it("addDistanceConstraint links spheres with rest length from radii", () => {
        resetMockBallIds(1);
        const a = mockBall(0, 0);
        const b = mockBall(30, 0);
        const state = createState([a, b]);
        const slack = 1.05;
        const restLength = (a.radius + b.radius) * slack;
        addDistanceConstraint(state.kinetic, { bodyA: a, bodyB: b, restLength });
        assert.equal(kineticConstraintStore.count, 1);
        assert.ok(Math.abs(kineticConstraintStore.restLength[0] - restLength) < 1e-5);
    });

    it("getConnectedBodyIds walks transitive links", () => {
        resetMockBallIds(1);
        const a = mockBall(0, 0);
        const b = mockBall(20, 0);
        const c = mockBall(40, 0);
        const state = createState([a, b, c]);
        addDistanceConstraint(state.kinetic, { bodyA: a, bodyB: b, restLength: 20 });
        addDistanceConstraint(state.kinetic, { bodyA: b, bodyB: c, restLength: 20 });
        const members = getConnectedBodyIds(state.kinetic, b.id).sort((x, y) => x - y);
        assert.deepEqual(
            members,
            [a.id, b.id, c.id].sort((x, y) => x - y),
        );
    });
});
