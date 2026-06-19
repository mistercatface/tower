import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { appendSpatialCellMemoryOverlayCommands, memoryHeatmapBucketStyle, memoryHeatmapRecencyBucket } from "../Libraries/AI/brain/spatialCellMemoryOverlay.js";
import { createSpatialCellMemory } from "../Libraries/AI/brain/spatialCellMemory.js";
import { WorldObstacleGrid } from "../Libraries/Spatial/grid/WorldObstacleGrid.js";
describe("spatial cell memory overlay", () => {
    it("memoryHeatmapRecencyBucket maps newest to highest bucket weight", () => {
        assert.equal(memoryHeatmapRecencyBucket(0, 128, 8), 0);
        assert.equal(memoryHeatmapRecencyBucket(127, 128, 8), 7);
    });
    it("memoryHeatmapBucketStyle fades oldest buckets", () => {
        const newest = memoryHeatmapBucketStyle(0, 8, { fillRgb: "255, 0, 0", fillAlphaMax: 0.3, fillAlphaMin: 0.05 });
        const oldest = memoryHeatmapBucketStyle(7, 8, { fillRgb: "255, 0, 0", fillAlphaMax: 0.3, fillAlphaMin: 0.05 });
        assert.ok(newest.fill.includes("0.3"));
        assert.ok(oldest.fill.includes("0.05"));
    });
    it("appendSpatialCellMemoryOverlayCommands emits one fill-only tile per memory cell", () => {
        const grid = new WorldObstacleGrid(16);
        grid.rebuildFixed(0, 0, 32 * 16, 32 * 16);
        const spatial = createSpatialCellMemory({ capacity: 4 });
        spatial.stamp(4, 4);
        spatial.stamp(5, 4);
        spatial.stamp(6, 4);
        const commands = [];
        appendSpatialCellMemoryOverlayCommands(commands, { grid, spatial });
        assert.equal(commands.length, 3);
        assert.equal(commands[0].kind, "aabb");
        assert.equal(commands[0].maxX - commands[0].minX, grid.cellSize);
        assert.equal(commands[0].maxY - commands[0].minY, grid.cellSize);
        assert.ok(commands[0].fill);
        assert.equal(commands[0].stroke, undefined);
        assert.ok(!commands[0].cache);
    });
});
