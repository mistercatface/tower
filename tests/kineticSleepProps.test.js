import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { WorldProp } from "../Entities/WorldProp.js";
import { SatCollision, entityFacing, SAT_RESULT } from "../Libraries/Spatial/collision/SatCollision.js";
import { separateAlongNormal } from "../Libraries/Spatial/collision/penetration.js";
import { LIBRARY_COLLISION_DEFAULTS } from "../Libraries/Motion/physicsDefaults.js";
import { advanceKineticSleep, evaluateKineticSleepEligible, hasSleepBlockingNeighbor } from "../Libraries/Motion/kineticSleep.js";
import { isRotatingEntity, pairBroadphaseOverlap, shouldResolveKineticPair } from "../Libraries/Spatial/collision/entityBroadphase.js";
const SLEEP_FRAMES = LIBRARY_COLLISION_DEFAULTS.kineticSleep.frames;
function separatePairUntilClear(a, b, maxPasses = 8) {
    for (let pass = 0; pass < maxPasses; pass++) {
        const collided = SatCollision.checkCollision(a.x, a.y, entityFacing(a), a.shape, b.x, b.y, entityFacing(b), b.shape);
        if (!collided) return;
        const overlap = SAT_RESULT[0];
        const nx = SAT_RESULT[1];
        const ny = SAT_RESULT[2];
        const coincident = SAT_RESULT[5] !== 0;
        if (coincident) return;
        separateAlongNormal(a, b, nx, ny, overlap, a.mass, b.mass);
    }
}
describe("kinetic sleep on proof props", () => {
    it("isolated crate sleeps after consecutive still frames", () => {
        const crate = new WorldProp(0, 0, "crate", 0);
        assert.ok(evaluateKineticSleepEligible(crate, []));
        for (let i = 0; i < SLEEP_FRAMES; i++) advanceKineticSleep(crate, true);
        assert.equal(crate.isSleeping, true);
    });
    it("resting crate stack can sleep together", () => {
        const bottom = new WorldProp(0, 0, "crate", 0);
        const top = new WorldProp(0, 14, "crate", 0);
        separatePairUntilClear(bottom, top);
        assert.ok(evaluateKineticSleepEligible(bottom, [top]));
        assert.ok(evaluateKineticSleepEligible(top, [bottom]));
        for (let i = 0; i < SLEEP_FRAMES; i++) {
            advanceKineticSleep(bottom, evaluateKineticSleepEligible(bottom, [top]));
            advanceKineticSleep(top, evaluateKineticSleepEligible(top, [bottom]));
        }
        assert.equal(bottom.isSleeping, true);
        assert.equal(top.isSleeping, true);
    });
    it("moving neighbor blocks sleep", () => {
        const rest = new WorldProp(0, 0, "crate", 0);
        const mover = new WorldProp(0, 14, "crate", 0);
        separatePairUntilClear(rest, mover);
        mover.vx = 5;
        assert.ok(hasSleepBlockingNeighbor(rest, [mover]));
        assert.ok(!evaluateKineticSleepEligible(rest, [mover]));
    });
    it("sleeping overlapping neighbor does not block sleep", () => {
        const bottom = new WorldProp(0, 0, "crate", 0);
        const top = new WorldProp(0, 14, "crate", 0);
        separatePairUntilClear(bottom, top);
        for (let i = 0; i < SLEEP_FRAMES; i++) advanceKineticSleep(top, true);
        top.isSleeping = true;
        assert.ok(!hasSleepBlockingNeighbor(bottom, [top]));
        assert.ok(evaluateKineticSleepEligible(bottom, [top]));
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
    it("resting overlapping pair skips contact resolve until something moves", () => {
        const a = new WorldProp(0, 0, "crate", 0);
        const b = new WorldProp(0, 14, "crate", 0);
        separatePairUntilClear(a, b);
        assert.ok(shouldResolveKineticPair(a, b, pairBroadphaseOverlap(a, b)) === false);
        a.vx = 10;
        assert.ok(shouldResolveKineticPair(a, b, pairBroadphaseOverlap(a, b)));
    });
});
