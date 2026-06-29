import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createTargetMemory, targetFromMemoryRecord } from "./harness/agentTestCompat.js";
const grid = {
    cellSize: 10,
    cols: 10,
    worldCol(x) {
        return Math.floor(x / 10);
    },
    worldRow(y) {
        return Math.floor(y / 10);
    },
};
describe("target memory", () => {
    it("records target facts with cell snapshots", () => {
        const memory = createTargetMemory(["food"], { food: 3 });
        memory.observe("food", { id: 7, x: 30, y: 40 }, { x: 0, y: 0 }, grid);
        assert.deepEqual(memory.snapshot().food, { kind: "food", id: 7, cellIdx: 43, ageTicks: 0, ttlTicks: 3, confidence: 1 });
    });
    it("ages records until ttl expires", () => {
        const memory = createTargetMemory(["prey"], { prey: 2 });
        memory.observe("prey", { id: 2, x: 20, y: 0 }, { x: 0, y: 0 }, grid);
        memory.observe("prey", null, { x: 0, y: 0 }, grid);
        assert.equal(memory.snapshot().prey.ageTicks, 1);
        assert.equal(memory.snapshot().prey.confidence, 0.5);
        memory.observe("prey", null, { x: 0, y: 0 }, grid);
        assert.equal(memory.snapshot().prey.ageTicks, 2);
        memory.observe("prey", null, { x: 0, y: 0 }, grid);
        assert.equal(memory.snapshot().prey, null);
    });
    it("clears matching targets by id", () => {
        const memory = createTargetMemory(["threat", "food"], { threat: 3, food: 3 });
        memory.observe("threat", { id: 9, x: 10, y: 0 }, { x: 0, y: 0 }, grid);
        memory.observe("food", { id: 9, x: 20, y: 0 }, { x: 0, y: 0 }, grid);
        memory.clearTarget(9);
        assert.deepEqual(memory.snapshot(), { threat: null, food: null });
    });
    it("creates target views from records", () => {
        const memory = createTargetMemory(["food"], { food: 3 });
        memory.observe("food", { id: 5, x: 10, y: 20 }, { x: 0, y: 0 }, grid);
        const record = memory.record("food");
        assert.deepEqual(targetFromMemoryRecord(record), { id: 5, x: 10, y: 20, memoryRecord: record });
    });
    it("drops dead entity ids when state is provided", () => {
        const memory = createTargetMemory(["food"], { food: 3 });
        memory.observe("food", { id: 5, x: 10, y: 20 }, { x: 0, y: 0 }, grid);
        const record = memory.record("food");
        const state = { entityRegistry: { getLive: () => ({ isDead: true }) } };
        assert.equal(targetFromMemoryRecord(record, state), null);
        assert.deepEqual(targetFromMemoryRecord(record), { id: 5, x: 10, y: 20, memoryRecord: record });
    });
});
