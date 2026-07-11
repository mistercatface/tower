import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { addDistanceConstraint, removeKineticConstraint, areBodiesConnected, getConnectedBodyIds, getConnectedComponentPath, getConstraintIslands, createKineticSession } from "../Libraries/Physics/physics.js";
import { kineticConstraintStore } from "../Core/engineMemory.js";
function createState() {
    return { kinetic: createKineticSession() };
}
function stubBody(id) {
    return { id, isDead: false, strategy: { isKinetic: true } };
}
function link(state, aId, bId) {
    const row = addDistanceConstraint(state.kinetic, { bodyA: stubBody(aId), bodyB: stubBody(bId), restLength: 10 });
    return kineticConstraintStore.id[row];
}
describe("kineticConstraintGraph", () => {
    it("getConnectedBodyIds returns the whole island for any member", () => {
        const state = createState();
        link(state, 1, 2);
        link(state, 2, 3);
        const ids = getConnectedBodyIds(state.kinetic, 2).sort((x, y) => x - y);
        assert.deepEqual(ids, [1, 2, 3]);
    });
    it("getConnectedComponentPath walks an acyclic chain end to end from the head", () => {
        const state = createState();
        link(state, 10, 11);
        link(state, 11, 12);
        link(state, 12, 13);
        assert.deepEqual(getConnectedComponentPath(state.kinetic, 10), [10, 11, 12, 13]);
    });
    it("areBodiesConnected reflects island membership across separate islands", () => {
        const state = createState();
        link(state, 1, 2);
        link(state, 5, 6);
        assert.ok(areBodiesConnected(state.kinetic, 1, 2));
        assert.ok(!areBodiesConnected(state.kinetic, 1, 5));
        assert.ok(areBodiesConnected(state.kinetic, 7, 7));
    });
    it("getConstraintIslands groups bodies into their connected components", () => {
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
    it("connected-id cache invalidates when constraint topology changes", () => {
        const state = createState();
        const first = link(state, 1, 2);
        const idsA = getConnectedBodyIds(state.kinetic, 1);
        assert.equal(getConnectedBodyIds(state.kinetic, 1), idsA, "same topology returns the cached member list");
        link(state, 2, 3);
        const idsB = getConnectedBodyIds(state.kinetic, 1);
        assert.notEqual(idsB, idsA, "adding a constraint rebuilds the cache");
        assert.deepEqual(idsB.slice().sort((x, y) => x - y), [1, 2, 3]);
        removeKineticConstraint(state.kinetic, first);
        assert.ok(!areBodiesConnected(state.kinetic, 1, 2), "cache reflects removed constraint");
    });
});
