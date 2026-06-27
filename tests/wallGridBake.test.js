import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { gridSettings } from "../Config/world.js";
import { cellToChunkCoord } from "../Libraries/Spatial/grid/GridCoords.js";
import { mergeCollinearRailWallBoxes } from "../Libraries/World/wallGridBake.js";

function makeHorizontalRailBox(gridCol) {
    return {
        gridCol,
        gridRow: 2,
        chunkCol: cellToChunkCoord(gridCol, gridSettings.minCellsPerChunk),
        chunkRow: cellToChunkCoord(2, gridSettings.minCellsPerChunk),
        gridSide: 0,
        wallCapHeight: 16,
        wallBaseZ: 0,
        edgeThickness: 2,
        inwardX: 0,
        inwardY: 1,
        minX: gridCol * 16,
        minY: 0,
        maxX: (gridCol + 1) * 16,
        maxY: 2,
        innerP1x: 0,
        innerP1y: 0,
        innerP2x: 0,
        innerP2y: 0,
        outerP1x: 0,
        outerP1y: 0,
        outerP2x: 0,
        outerP2y: 0,
        cx: 0,
        cy: 0,
    };
}

describe("wall grid bake", () => {
    it("does not merge collinear rail boxes across chunk boundaries", () => {
        const boxes = [makeHorizontalRailBox(7), makeHorizontalRailBox(8)];

        mergeCollinearRailWallBoxes(boxes);

        assert.equal(boxes.length, 2);
    });

    it("still merges collinear rail boxes inside one chunk", () => {
        const boxes = [makeHorizontalRailBox(6), makeHorizontalRailBox(7)];

        mergeCollinearRailWallBoxes(boxes);

        assert.equal(boxes.length, 1);
    });
});
