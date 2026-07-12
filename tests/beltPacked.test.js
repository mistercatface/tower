import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BeltPacked } from "../Libraries/Spatial/belts.js";
import { WorldObstacleGrid } from "../Libraries/Spatial/spatial.js";

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

    it("stripKey returns the packed int", () => {
        const packed = BeltPacked.pack(3, 1);
        assert.equal(BeltPacked.stripKey(packed), packed);
    });

    it("stepSideBetween respects row wrap", () => {
        const cols = 5;
        const idx = 4;
        assert.equal(BeltPacked.stepSideBetween(idx, idx + 1, cols), -1);
        assert.equal(BeltPacked.stepSideBetween(idx, idx - 1, cols), 3);
        assert.equal(BeltPacked.stepSideBetween(0, 1, cols), 1);
    });

    it("blocksStep enforces belt flow direction", () => {
        const grid = new WorldObstacleGrid(16);
        grid.rebuildFixed(64, 64, 128, 128);
        const beltIdx = 2 + 2 * grid.cols;
        grid.writeFloorCell(beltIdx, BeltPacked.defaultForSpawn("floor_belt"));
        const westIdx = beltIdx - 1;
        const eastIdx = beltIdx + 1;
        assert.equal(BeltPacked.blocksStep(grid, westIdx, beltIdx), false);
        assert.equal(BeltPacked.blocksStep(grid, eastIdx, beltIdx), true);
        assert.equal(BeltPacked.blocksStep(grid, beltIdx, eastIdx), false);
        assert.equal(BeltPacked.blocksStep(grid, beltIdx, westIdx), true);
    });

    it("orientationOptions lists valid packed bytes", () => {
        const options = BeltPacked.orientationOptions();
        assert.ok(options.length > 0);
        for (const option of options) {
            assert.equal(BeltPacked.isValid(option.packed), true);
            assert.equal(option.label, BeltPacked.label(option.packed));
        }
    });
});
