import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createSpatialCellMemory } from "../Libraries/AI/brain/spatialCellMemory.js";
import { createBrain } from "../Libraries/AI/brain/createBrain.js";

describe("spatialCellMemory", () => {
    it("evicts oldest cells when capacity is exceeded", () => {
        const memory = createSpatialCellMemory({ capacity: 3 });
        memory.stamp(1, 1);
        memory.stamp(2, 2);
        memory.stamp(3, 3);
        assert.equal(memory.size, 3);
        memory.stamp(4, 4);
        assert.equal(memory.size, 3);
        assert.ok(!memory.has(1, 1));
        assert.ok(memory.has(2, 2));
        assert.ok(memory.has(3, 3));
        assert.ok(memory.has(4, 4));
    });

    it("refreshes recency when a cell is stamped again", () => {
        const memory = createSpatialCellMemory({ capacity: 3 });
        memory.stamp(1, 1);
        memory.stamp(2, 2);
        memory.stamp(3, 3);
        memory.stamp(1, 1);
        memory.stamp(4, 4);
        assert.ok(memory.has(1, 1));
        assert.ok(!memory.has(2, 2));
        assert.ok(memory.has(3, 3));
        assert.ok(memory.has(4, 4));
    });

    it("iterates newest-first for recency-ordered reads", () => {
        const memory = createSpatialCellMemory({ capacity: 4 });
        memory.stamp(1, 1);
        memory.stamp(2, 2);
        memory.stamp(1, 1);
        const order = [];
        memory.forEachNewestFirst((col, row) => order.push(`${col},${row}`));
        assert.deepEqual(order, ["1,1", "2,2"]);
    });
});

describe("createBrain", () => {
    it("stamps seen cells and arrivals through spatial memory", () => {
        const brain = createBrain({ spatialMemoryCapacity: 2 });
        brain.stampSeenCells([{ col: 5, row: 5 }]);
        brain.stampArrival(6, 6);
        assert.ok(brain.spatial.has(5, 5));
        assert.ok(brain.spatial.has(6, 6));
        brain.stampArrival(7, 7);
        assert.ok(!brain.spatial.has(5, 5));
        assert.ok(brain.spatial.has(6, 6));
        assert.ok(brain.spatial.has(7, 7));
    });
});
