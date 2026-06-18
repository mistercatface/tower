import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { KineticSpatialFrame } from "../Systems/World/KineticSpatialFrame.js";
import { SLEEP_FRAMES, advanceKineticSleep } from "../Libraries/Motion/kineticSleep.js";

function mockKineticBody(isSleeping = false) {
    return { isSleeping, isDead: false, strategy: { isKinetic: true }, _sleepFrames: 0 };
}

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
});
