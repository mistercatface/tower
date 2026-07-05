import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createKineticSession } from "../GameState/KineticSession.js";
import { addDistanceConstraint, removeKineticConstraint, resetKineticConstraintIds } from "../Libraries/Motion/kineticConstraintSolver.js";
import { areBodiesConnected, getConnectedBodyIds, getConnectedComponentPath, getConstraintIslands, getKineticConstraintGraph } from "../Libraries/Motion/kineticConstraintSolver.js";
function createState() {
    return { kinetic: createKineticSession() };
}
function stubBody(id) {
    return { id, isDead: false, strategy: { isKinetic: true } };
}
function link(state, aId, bId) {
    return addDistanceConstraint(state.kinetic, { bodyA: stubBody(aId), bodyB: stubBody(bId), restLength: 10 });
}
describe("kineticConstraintGraph", () => {
    it("getConnectedBodyIds returns the whole island for any member", () => {
        resetKineticConstraintIds(1);
        const state = createState();
        link(state, 1, 2);
        link(state, 2, 3);
        const ids = getConnectedBodyIds(state.kinetic, 2).sort((x, y) => x - y);
        assert.deepEqual(ids, [1, 2, 3]);
    });
    it("getConnectedComponentPath walks an acyclic chain end to end from the head", () => {
        resetKineticConstraintIds(1);
        const state = createState();
        link(state, 10, 11);
        link(state, 11, 12);
        link(state, 12, 13);
        assert.deepEqual(getConnectedComponentPath(state.kinetic, 10), [10, 11, 12, 13]);
    });
    it("areBodiesConnected reflects island membership across separate islands", () => {
        resetKineticConstraintIds(1);
        const state = createState();
        link(state, 1, 2);
        link(state, 5, 6);
        assert.ok(areBodiesConnected(state.kinetic, 1, 2));
        assert.ok(!areBodiesConnected(state.kinetic, 1, 5));
        assert.ok(areBodiesConnected(state.kinetic, 7, 7));
    });
    it("getConstraintIslands groups bodies into their connected components", () => {
        resetKineticConstraintIds(1);
        const state = createState();
        link(state, 1, 2);
        link(state, 2, 3);
        link(state, 8, 9);
        const islands = getConstraintIslands(state.kinetic).map((island) => island.slice().sort((x, y) => x - y)).sort((a, b) => a[0] - b[0]);
        assert.deepEqual(islands, [
            [1, 2, 3],
            [8, 9],
        ]);
    });
    it("caches the adjacency map until the constraint topology changes", () => {
        resetKineticConstraintIds(1);
        const state = createState();
        const first = link(state, 1, 2);
        const graphA = getKineticConstraintGraph(state.kinetic);
        assert.equal(getKineticConstraintGraph(state.kinetic), graphA, "same topology returns the cached graph");
        link(state, 2, 3);
        const graphB = getKineticConstraintGraph(state.kinetic);
        assert.notEqual(graphB, graphA, "adding a constraint rebuilds the graph");
        removeKineticConstraint(state.kinetic, first.id);
        assert.ok(!areBodiesConnected(state.kinetic, 1, 2), "cache reflects removed constraint");
    });
});
