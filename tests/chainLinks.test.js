import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CircleShape } from "../Libraries/Physics/physics.js";
import { createKineticSession } from "../GameState/KineticSession.js";
import { resetKineticConstraintIds } from "../Libraries/Physics/physics.js";
import { addChainLink, getChainMemberIds, hasChainMembership, isChainSteeringTarget, resolveChainLinkRestLength, resyncChainLinkRestLengths, setChainHead } from "../Libraries/Props/props.js";
import { setPropRadius } from "../Libraries/Props/props.js";
class MockEntityMeta {
    constructor() {
        this.byEntityId = new Map();
    }
    get(entityId) {
        return this.byEntityId.get(entityId) ?? null;
    }
    ensure(entityId) {
        let meta = this.byEntityId.get(entityId);
        if (!meta) {
            meta = {};
            this.byEntityId.set(entityId, meta);
        }
        return meta;
    }
    isChainHead(entityId) {
        return this.get(entityId)?.chainHead === true;
    }
    setChainHead(entityId, head = true) {
        if (head) this.ensure(entityId).chainHead = true;
        else if (this.get(entityId)) this.get(entityId).chainHead = false;
    }
}
let nextId = 1;
function mockBall(x, y) {
    return {
        id: nextId++,
        x,
        y,
        type: "ball",
        strategy: { isKinetic: true },
        shape: new CircleShape(4),
    };
}
function createState(props) {
    return {
        kinetic: createKineticSession(),
        sandbox: { entityMeta: new MockEntityMeta() },
        entityRegistry: {
            getLive(id) {
                for (let i = 0; i < props.length; i++) if (props[i].id === id) return props[i];
                return null;
            },
        },
    };
}
describe("chain links", () => {
    it("addChainLink creates a distance constraint from linked sphere radii", () => {
        resetKineticConstraintIds(1);
        const a = mockBall(0, 0);
        const b = mockBall(30, 0);
        const state = createState([a, b]);
        assert.ok(addChainLink(state, a.id, b.id, 1.05));
        assert.equal(state.kinetic.kineticConstraints.length, 1);
        assert.equal(state.kinetic.kineticConstraints[0].restLength, resolveChainLinkRestLength(a, b, 1.05));
    });
    it("resyncChainLinkRestLengths updates rest lengths after prop scale", () => {
        resetKineticConstraintIds(1);
        const a = mockBall(0, 0);
        const b = mockBall(8.4, 0);
        const state = createState([a, b]);
        addChainLink(state, a.id, b.id, 1.05);
        setPropRadius(a, 3);
        setPropRadius(b, 3);
        resyncChainLinkRestLengths(state, [a.id, b.id], 1.05);
        assert.equal(state.kinetic.kineticConstraints[0].restLength, resolveChainLinkRestLength(a, b, 1.05));
    });
    it("chain tail is not a steering target but head is", () => {
        resetKineticConstraintIds(1);
        const head = mockBall(0, 0);
        const tail = mockBall(20, 0);
        const state = createState([head, tail]);
        addChainLink(state, head.id, tail.id);
        setChainHead(state, state.sandbox.entityMeta, head.id);
        assert.ok(isChainSteeringTarget(state, state.sandbox.entityMeta, head.id));
        assert.ok(!isChainSteeringTarget(state, state.sandbox.entityMeta, tail.id));
    });
    it("unlinked nav ball remains a steering target", () => {
        const ball = mockBall(0, 0);
        const state = createState([ball]);
        assert.ok(isChainSteeringTarget(state, state.sandbox.entityMeta, ball.id));
        assert.ok(!hasChainMembership(state, ball.id));
    });
    it("addChainLink accepts tri wedges marked chain-link eligible", () => {
        resetKineticConstraintIds(2);
        const head = mockBall(0, 0);
        const wedge = {
            id: nextId++,
            x: 20,
            y: 0,
            type: "tri_wedge",
            radius: 10,
            strategy: { isKinetic: true, canChain: true },
            shape: new CircleShape(10),
        };
        const state = createState([head, wedge]);
        assert.ok(addChainLink(state, head.id, wedge.id, 1.05));
        assert.equal(state.kinetic.kineticConstraints.length, 1);
    });
    it("getChainMemberIds walks transitive links", () => {
        resetKineticConstraintIds(1);
        const a = mockBall(0, 0);
        const b = mockBall(20, 0);
        const c = mockBall(40, 0);
        const state = createState([a, b, c]);
        addChainLink(state, a.id, b.id);
        addChainLink(state, b.id, c.id);
        const members = getChainMemberIds(state, b.id).sort((x, y) => x - y);
        assert.deepEqual(
            members,
            [a.id, b.id, c.id].sort((x, y) => x - y),
        );
    });
});
