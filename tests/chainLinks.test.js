import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createKineticSession } from "../GameState/KineticSession.js";
import { getConnectedBodyIds } from "../Libraries/Physics/physics.js";
import { addChainLink, hasChainMembership, isChainSteeringTarget, resolveChainLinkRestLength, resyncChainLinkRestLengths, setChainHead, SandboxEntityMetaStore } from "../Libraries/Sandbox/sandbox.js";
import { setCirclePropRadius } from "../Libraries/Props/props.js";
import { mockBall, resetMockBallIds } from "./harness/kineticTickHarness.js";
import { CircleShape } from "../Libraries/Physics/physics.js";

function createState(props) {
    return {
        kinetic: createKineticSession(),
        sandbox: { entityMeta: new SandboxEntityMetaStore() },
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
        resetMockBallIds(1);
        const a = mockBall(0, 0);
        const b = mockBall(30, 0);
        const state = createState([a, b]);
        assert.ok(addChainLink(state, a.id, b.id, 1.05));
        assert.equal(state.kinetic.kineticConstraints.length, 1);
        assert.equal(state.kinetic.kineticConstraints[0].restLength, resolveChainLinkRestLength(a, b, 1.05));
    });
    it("resyncChainLinkRestLengths updates rest lengths after prop scale", () => {
        resetMockBallIds(1);
        const a = mockBall(0, 0);
        const b = mockBall(8.4, 0);
        const state = createState([a, b]);
        addChainLink(state, a.id, b.id, 1.05);
        setCirclePropRadius(a, 3);
        setCirclePropRadius(b, 3);
        resyncChainLinkRestLengths(state, [a.id, b.id], 1.05);
        assert.equal(state.kinetic.kineticConstraints[0].restLength, resolveChainLinkRestLength(a, b, 1.05));
    });
    it("chain tail is not a steering target but head is", () => {
        resetMockBallIds(1);
        const head = mockBall(0, 0);
        const tail = mockBall(20, 0);
        const state = createState([head, tail]);
        addChainLink(state, head.id, tail.id);
        setChainHead(state, state.sandbox.entityMeta, head.id);
        assert.ok(isChainSteeringTarget(state, state.sandbox.entityMeta, head.id));
        assert.ok(!isChainSteeringTarget(state, state.sandbox.entityMeta, tail.id));
    });
    it("unlinked nav ball remains a steering target", () => {
        resetMockBallIds(1);
        const ball = mockBall(0, 0);
        const state = createState([ball]);
        assert.ok(isChainSteeringTarget(state, state.sandbox.entityMeta, ball.id));
        assert.ok(!hasChainMembership(state, ball.id));
    });
    it("addChainLink accepts tri wedges marked chain-link eligible", () => {
        resetMockBallIds(1);
        const head = mockBall(0, 0);
        const wedge = {
            id: 2,
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
    it("getConnectedBodyIds walks transitive links", () => {
        resetMockBallIds(1);
        const a = mockBall(0, 0);
        const b = mockBall(20, 0);
        const c = mockBall(40, 0);
        const state = createState([a, b, c]);
        addChainLink(state, a.id, b.id);
        addChainLink(state, b.id, c.id);
        const members = getConnectedBodyIds(state.kinetic, b.id).sort((x, y) => x - y);
        assert.deepEqual(
            members,
            [a.id, b.id, c.id].sort((x, y) => x - y),
        );
    });
});
