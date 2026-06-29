import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createSpatialCellMemory } from "../Libraries/AI/brain/brain.js";
import { createBrain, buildNavStepPenaltyFromSpatialMemory } from "./harness/agentTestCompat.js";

describe("spatialCellMemory", () => {
    it("evicts oldest cells when capacity is exceeded", () => {
        const memory = createSpatialCellMemory({ capacity: 3 });
        memory.stamp(65);
        memory.stamp(130);
        memory.stamp(195);
        assert.equal(memory.size, 3);
        memory.stamp(260);
        assert.equal(memory.size, 3);
        assert.ok(!memory.has(65));
        assert.ok(memory.has(130));
        assert.ok(memory.has(195));
        assert.ok(memory.has(260));
    });

    it("refreshes recency when a cell is stamped again", () => {
        const memory = createSpatialCellMemory({ capacity: 3 });
        memory.stamp(65);
        memory.stamp(130);
        memory.stamp(195);
        memory.stamp(65);
        memory.stamp(260);
        assert.ok(memory.has(65));
        assert.ok(!memory.has(130));
        assert.ok(memory.has(195));
        assert.ok(memory.has(260));
    });

    it("iterates newest-first for recency-ordered reads", () => {
        const memory = createSpatialCellMemory({ capacity: 4 });
        memory.stamp(65);
        memory.stamp(130);
        memory.stamp(65);
        const order = [];
        memory.forEachNewestFirst((idx) => order.push(idx));
        assert.deepEqual(order, [65, 130]);
    });

    it("getRecencyRankFromNewest orders oldest last", () => {
        const memory = createSpatialCellMemory({ capacity: 4 });
        memory.stamp(65);
        memory.stamp(130);
        memory.stamp(195);
        assert.equal(memory.getRecencyRankFromNewest(195), 0);
        assert.equal(memory.getRecencyRankFromNewest(65), 2);
        assert.equal(memory.getRecencyRankFromNewest(9 + 9 * 64), -1);
    });
});

describe("createBrain", () => {
    it("stamps seen cells and arrivals through spatial memory", () => {
        const brain = createBrain({ spatialMemoryCapacity: 2 });
        brain.stampSeenCells([5 + 5 * 64]);
        brain.stampArrival(6 + 6 * 64);
        assert.ok(brain.spatial.has(5 + 5 * 64));
        assert.ok(brain.spatial.has(6 + 6 * 64));
        brain.stampArrival(7 + 7 * 64);
        assert.ok(!brain.spatial.has(5 + 5 * 64));
        assert.ok(brain.spatial.has(6 + 6 * 64));
        assert.ok(brain.spatial.has(7 + 7 * 64));
    });

    it("buildNavStepPenaltyFromSpatialMemory assigns higher cost to newer cells", () => {
        const brain = createBrain({ spatialMemoryCapacity: 4 });
        brain.stampArrival(65);
        brain.stampArrival(130);
        brain.stampArrival(195);
        const penalty = buildNavStepPenaltyFromSpatialMemory(brain.spatial, { basePenalty: 10, falloff: 0.5 });
        assert.ok(penalty);
        assert.ok(penalty.costs[0] > penalty.costs[penalty.costs.length - 1]);
    });
});
