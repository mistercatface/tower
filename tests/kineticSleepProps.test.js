import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { loadPropAssets } from "../Libraries/Props/loadPropAssets.js";
import { WorldProp } from "../Entities/WorldProp.js";
import { SatCollision } from "../Libraries/Spatial/collision/SatCollision.js";
import { separateAlongNormal } from "../Libraries/Spatial/collision/penetration.js";
import { SLEEP_FRAMES, advanceKineticSleep, evaluateKineticSleepEligible } from "../Libraries/Motion/kineticSleep.js";
import { isRotatingEntity } from "../Libraries/Spatial/collision/entityBroadphase.js";
loadPropAssets();
function separatePairUntilClear(a, b, maxPasses = 8) {
    for (let pass = 0; pass < maxPasses; pass++) {
        const info = SatCollision.checkCollision(a, a.getShape(), b, b.getShape());
        if (!info || info.coincident) return;
        separateAlongNormal(a, b, info.nx, info.ny, info.overlap, a.mass, b.mass);
    }
}
describe("kinetic sleep on proof props", () => {
    it("isolated crate sleeps after consecutive still frames", () => {
        const crate = new WorldProp(0, 0, "crate", 0);
        assert.ok(evaluateKineticSleepEligible(crate, []));
        for (let i = 0; i < SLEEP_FRAMES; i++) advanceKineticSleep(crate, true);
        assert.equal(crate.isSleeping, true);
    });
    it("touching crate stack blocks sleep via broadphase overlap", () => {
        const bottom = new WorldProp(0, 0, "crate", 0);
        const top = new WorldProp(0, 14, "crate", 0);
        separatePairUntilClear(bottom, top);
        assert.ok(!evaluateKineticSleepEligible(bottom, [top]));
        assert.ok(!evaluateKineticSleepEligible(top, [bottom]));
    });
    it("slow spin keeps tri wedge eligible for wall collision", () => {
        const wedge = new WorldProp(0, 0, "tri_wedge", 0);
        wedge.vx = 0;
        wedge.vy = 0;
        wedge.angularVelocity = 0.12;
        assert.ok(wedge.needsWallCollision());
        assert.ok(isRotatingEntity(wedge));
    });
    it("motion resets sleep counter on proof props", () => {
        const hex = new WorldProp(0, 0, "hex_block", 0);
        for (let i = 0; i < SLEEP_FRAMES - 1; i++) advanceKineticSleep(hex, true);
        hex.vx = 5;
        advanceKineticSleep(hex, false);
        assert.equal(hex.isSleeping, false);
        assert.equal(hex._sleepFrames, 0);
    });
});
