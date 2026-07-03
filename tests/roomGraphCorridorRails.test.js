import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { layoutLocalCellIndex, createCellIndexLayout } from "../Libraries/Spatial/grid/GridUtils.js";
import { railWallsFromFloorMask } from "../Libraries/RoomGraph/roomGraphCorridorApply.js";

describe("room graph corridor rails", () => {
    it("builds rail walls from offset floor mask without internal shared edges", () => {
        const layout = createCellIndexLayout(10, 20, 3, 2);
        const mask = new Uint8Array(layout.cellCount);
        mask[layoutLocalCellIndex(layout, 1, 0)] = 1;
        mask[layoutLocalCellIndex(layout, 1, 1)] = 1;

        const walls = railWallsFromFloorMask(mask, 3, 2, 10, 20, 2, 1);
        const keys = new Set(walls.map((wall) => `${wall.col},${wall.row},${wall.side}`));

        assert.equal(walls.length, 6);
        assert.ok(keys.has("11,20,0"));
        assert.ok(keys.has("11,20,1"));
        assert.ok(keys.has("11,20,3"));
        assert.ok(!keys.has("11,20,2"), "shared edge between adjacent floor cells should be omitted");
        assert.ok(!keys.has("11,21,0"), "shared edge between adjacent floor cells should be omitted");
        assert.ok(keys.has("11,21,1"));
        assert.ok(keys.has("11,21,2"));
        assert.ok(keys.has("11,21,3"));
    });
});
