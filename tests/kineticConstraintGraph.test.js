import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { addDistanceConstraint, clearKineticConstraints, getConnectedBodyIds, createKineticSession } from "../Libraries/Physics/physics.js";
import { entityGameId, kineticConstraintStore } from "../Core/engineMemory.js";
import { allocateEntityEid, noteEntityEidHighWater } from "../Core/entitySlots.js";

function createState() {
    return { kinetic: createKineticSession() };
}

function bindGameId(gameId) {
    const eid = allocateEntityEid();
    noteEntityEidHighWater(eid);
    entityGameId[eid] = gameId;
    return eid;
}

function link(state, aId, bId) {
    const eidA = bindGameId(aId);
    const eidB = bindGameId(bId);
    const row = addDistanceConstraint(state.kinetic, eidA, eidB, { restLength: 10 });
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
    it("getConnectedBodyIds reflects island membership across separate islands", () => {
        const state = createState();
        link(state, 1, 2);
        link(state, 5, 6);
        assert.ok(getConnectedBodyIds(state.kinetic, 1).includes(2));
        assert.ok(!getConnectedBodyIds(state.kinetic, 1).includes(5));
        assert.ok(getConnectedBodyIds(state.kinetic, 7).includes(7));
    });
    it("connected-id cache invalidates when constraint topology changes", () => {
        const state = createState();
        link(state, 1, 2);
        const idsA = getConnectedBodyIds(state.kinetic, 1);
        assert.equal(getConnectedBodyIds(state.kinetic, 1), idsA, "same topology returns the cached member list");
        link(state, 2, 3);
        const idsB = getConnectedBodyIds(state.kinetic, 1);
        assert.notEqual(idsB, idsA, "adding a constraint rebuilds the cache");
        assert.deepEqual(idsB.slice().sort((x, y) => x - y), [1, 2, 3]);
        clearKineticConstraints(state.kinetic);
        const idsC = getConnectedBodyIds(state.kinetic, 1);
        assert.notEqual(idsC, idsB, "clearing constraints rebuilds the cache");
        assert.deepEqual(idsC, [1]);
    });
});
