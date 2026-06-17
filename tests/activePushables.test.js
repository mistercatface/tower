import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CombatSpatialFrame } from "../Systems/World/CombatSpatialFrame.js";
import { SLEEP_FRAMES, advancePushableSleep } from "../Libraries/Motion/pushableSleep.js";

function mockPushable(isSleeping = false) {
    return { isSleeping, isDead: false, strategy: { isPushable: true }, _sleepFrames: 0 };
}

describe("active pushables", () => {
    it("syncActivePushables keeps only awake bodies", () => {
        const frame = new CombatSpatialFrame(50);
        const awake = mockPushable(false);
        const asleep = mockPushable(true);
        frame._pushables.push(awake, asleep);
        frame.syncActivePushables();
        assert.equal(frame._activePushables.length, 1);
        assert.equal(frame._activePushables[0], awake);
    });

    it("activatePushable wakes and appends once", () => {
        const frame = new CombatSpatialFrame(50);
        const prop = mockPushable(true);
        frame._pushables.push(prop);
        frame.syncActivePushables();
        assert.equal(frame._activePushables.length, 0);
        frame.activatePushable(prop);
        assert.equal(prop.isSleeping, false);
        assert.equal(frame._activePushables.length, 1);
        frame.activatePushable(prop);
        assert.equal(frame._activePushables.length, 1);
    });

    it("sleeping pushable drops out of active list on next sync", () => {
        const frame = new CombatSpatialFrame(50);
        const prop = mockPushable(false);
        frame._pushables.push(prop);
        frame.syncActivePushables();
        assert.equal(frame._activePushables.length, 1);
        for (let i = 0; i < SLEEP_FRAMES; i++) advancePushableSleep(prop, true);
        assert.equal(prop.isSleeping, true);
        frame.syncActivePushables();
        assert.equal(frame._activePushables.length, 0);
    });
});
