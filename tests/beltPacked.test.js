import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BeltPacked } from "../Libraries/Spatial/spatial.js";

describe("BeltPacked", () => {
    it("packs entry and exit sides into one byte", () => {
        const packed = BeltPacked.pack(3, 1);
        assert.equal(BeltPacked.entry(packed), 3);
        assert.equal(BeltPacked.exit(packed), 1);
        assert.equal(BeltPacked.isValid(packed), true);
    });

    it("rotates both sides mod 4", () => {
        const packed = BeltPacked.pack(3, 1);
        const rotated = BeltPacked.rotate(packed, 1);
        assert.equal(BeltPacked.entry(rotated), 0);
        assert.equal(BeltPacked.exit(rotated), 2);
    });

    it("exposes table-driven turn and flow angle", () => {
        const straight = BeltPacked.pack(3, 1);
        assert.equal(BeltPacked.turn(straight), 1);
        const left = BeltPacked.defaultForSpawn("floor_belt_elbow_left");
        assert.equal(BeltPacked.turn(left), 0);
        const right = BeltPacked.defaultForSpawn("floor_belt_elbow_right");
        assert.equal(BeltPacked.turn(right), 2);
        assert.equal(BeltPacked.flowAngle(straight), 0);
    });

    it("maps spawn asset ids to default packed orientations", () => {
        assert.equal(BeltPacked.defaultForSpawn("floor_belt"), BeltPacked.pack(3, 1));
        assert.equal(BeltPacked.defaultForSpawn("floor_belt_elbow_left"), BeltPacked.pack(2, 1));
        assert.equal(BeltPacked.defaultForSpawn("floor_belt_elbow_right"), BeltPacked.pack(0, 1));
    });

    it("stripKey is table-driven per packed byte", () => {
        const packed = BeltPacked.pack(3, 1);
        assert.equal(BeltPacked.stripKey(packed), `p${packed}`);
    });
});
