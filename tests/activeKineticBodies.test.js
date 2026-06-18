import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { KineticSpatialFrame } from "../Systems/World/KineticSpatialFrame.js";
import { SLEEP_FRAMES, advanceKineticSleep } from "../Libraries/Motion/kineticSleep.js";
import { CircleShape } from "../Libraries/Spatial/collision/Shapes.js";

function mockKineticBody(isSleeping = false) {
    return { isSleeping, isDead: false, strategy: { isKinetic: true }, _sleepFrames: 0 };
}

function mockCircleProp(x, y, radius) {
    return {
        id: 1,
        x,
        y,
        radius,
        isSleeping: false,
        isDead: false,
        strategy: { isKinetic: true },
        getShape() {
            return new CircleShape(radius);
        },
    };
}

const mockGrid = { minX: -500, maxX: 500, minY: -500, maxY: 500 };
const mockState = { entityRegistry: { membershipGen: 1 } };

describe("active kinetic bodies", () => {
    it("syncActiveKineticBodies keeps only awake bodies", () => {
        const frame = new KineticSpatialFrame(50);
        const awake = mockKineticBody(false);
        const asleep = mockKineticBody(true);
        frame._kineticBodies.push(awake, asleep);
        frame.syncActiveKineticBodies();
        assert.equal(frame._activeKineticBodies.length, 1);
        assert.equal(frame._activeKineticBodies[0], awake);
    });

    it("activateKineticBody wakes and appends once", () => {
        const frame = new KineticSpatialFrame(50);
        const prop = mockKineticBody(true);
        frame._kineticBodies.push(prop);
        frame.syncActiveKineticBodies();
        assert.equal(frame._activeKineticBodies.length, 0);
        frame.activateKineticBody(prop);
        assert.equal(prop.isSleeping, false);
        assert.equal(frame._activeKineticBodies.length, 1);
        frame.activateKineticBody(prop);
        assert.equal(frame._activeKineticBodies.length, 1);
    });

    it("sleeping kinetic body drops out of active list on next sync", () => {
        const frame = new KineticSpatialFrame(50);
        const prop = mockKineticBody(false);
        frame._kineticBodies.push(prop);
        frame.syncActiveKineticBodies();
        assert.equal(frame._activeKineticBodies.length, 1);
        for (let i = 0; i < SLEEP_FRAMES; i++) advanceKineticSleep(prop, true);
        assert.equal(prop.isSleeping, true);
        frame.syncActiveKineticBodies();
        assert.equal(frame._activeKineticBodies.length, 0);
    });

    it("admitKineticProp makes mid-frame spawns visible to neighbor queries", () => {
        const frame = new KineticSpatialFrame(50);
        frame.resetFrame(mockGrid);
        const anchor = mockCircleProp(0, 0, 10);
        frame.insertEntity(anchor, 0);
        frame._kineticBodies.push(anchor);
        frame._nextPhysId = 1;
        const fragment = mockCircleProp(24, 0, 8);
        frame.admitKineticProp(fragment, mockState);
        const neighbors = frame.getNeighbors(anchor);
        assert.ok(neighbors.includes(fragment));
        assert.ok(frame._activeKineticBodies.includes(fragment));
    });

    it("admitKineticProp reindexes props after geometry or position changes", () => {
        const frame = new KineticSpatialFrame(50);
        frame.resetFrame(mockGrid);
        const mover = mockCircleProp(0, 0, 10);
        frame.insertEntity(mover, 0);
        frame._kineticBodies.push(mover);
        frame._nextPhysId = 1;
        const witness = mockCircleProp(200, 0, 8);
        frame.admitKineticProp(witness, mockState);
        assert.equal(frame.getNeighbors(witness).includes(mover), false);
        mover.x = 200;
        frame.admitKineticProp(mover, mockState);
        assert.ok(frame.getNeighbors(witness).includes(mover));
    });
});
