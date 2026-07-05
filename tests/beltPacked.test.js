import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BeltPacked, WorldObstacleGrid } from "../Libraries/Spatial/spatial.js";

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

    it("stepPenalty favors flow-aligned steps", () => {
        const cols = 5;
        const floorPacked = new Uint8Array(cols * 3);
        const beltIdx = 2 + 1 * cols;
        floorPacked[beltIdx] = BeltPacked.defaultForSpawn("floor_belt");
        const withFlow = BeltPacked.stepPenalty(1 + 1 * cols, beltIdx, cols, floorPacked);
        const againstFlow = BeltPacked.stepPenalty(3 + 1 * cols, beltIdx, cols, floorPacked);
        assert.equal(withFlow, 0);
        assert.equal(againstFlow, 20);
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
