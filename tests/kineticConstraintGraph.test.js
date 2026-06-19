import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { addDistanceConstraint, removeKineticConstraint, resetKineticConstraintIds } from "../Libraries/Motion/kineticConstraints.js";
import {
    areBodiesConnected,
    getConnectedBodyIds,
    getConnectedComponentPath,
    getConstraintIslands,
    getKineticConstraintGraph,
} from "../Libraries/Motion/kineticConstraintGraph.js";
function createState() {
    return { sandbox: { kineticConstraints: [] } };
}
function link(state, a, b) {
    return addDistanceConstraint(state.sandbox, { bodyAId: a, bodyBId: b, restLength: 10 });
}
describe("kineticConstraintGraph", () => {
    it("getConnectedBodyIds returns the whole island for any member", () => {
        resetKineticConstraintIds(1);
        const state = createState();
        link(state, 1, 2);
        link(state, 2, 3);
        const ids = getConnectedBodyIds(state.sandbox, 2).sort((x, y) => x - y);
        assert.deepEqual(ids, [1, 2, 3]);
    });
    it("getConnectedComponentPath walks an acyclic chain end to end from the head", () => {
        resetKineticConstraintIds(1);
        const state = createState();
        link(state, 10, 11);
        link(state, 11, 12);
        link(state, 12, 13);
        assert.deepEqual(getConnectedComponentPath(state.sandbox, 10), [10, 11, 12, 13]);
    });
    it("areBodiesConnected reflects island membership across separate islands", () => {
        resetKineticConstraintIds(1);
        const state = createState();
        link(state, 1, 2);
        link(state, 5, 6);
        assert.ok(areBodiesConnected(state.sandbox, 1, 2));
        assert.ok(!areBodiesConnected(state.sandbox, 1, 5));
        assert.ok(areBodiesConnected(state.sandbox, 7, 7));
    });
    it("getConstraintIslands groups bodies into their connected components", () => {
        resetKineticConstraintIds(1);
        const state = createState();
        link(state, 1, 2);
        link(state, 2, 3);
        link(state, 8, 9);
        const islands = getConstraintIslands(state.sandbox).map((island) => island.slice().sort((x, y) => x - y)).sort((a, b) => a[0] - b[0]);
        assert.deepEqual(islands, [
            [1, 2, 3],
            [8, 9],
        ]);
    });
    it("caches the adjacency map until the constraint topology changes", () => {
        resetKineticConstraintIds(1);
        const state = createState();
        const first = link(state, 1, 2);
        const graphA = getKineticConstraintGraph(state.sandbox);
        assert.equal(getKineticConstraintGraph(state.sandbox), graphA, "same topology returns the cached graph");
        link(state, 2, 3);
        const graphB = getKineticConstraintGraph(state.sandbox);
        assert.notEqual(graphB, graphA, "adding a constraint rebuilds the graph");
        removeKineticConstraint(state.sandbox, first.id);
        assert.ok(!areBodiesConnected(state.sandbox, 1, 2), "cache reflects removed constraint");
    });
});
