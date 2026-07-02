import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createTargetMemory, targetFromMemoryRecord } from "./harness/agentTestCompat.js";
import { TargetMemory, AgentIntentMemory } from "../Libraries/Game/snake/GroundNavIntentAdapter.js";
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
    it("applies longer engaged TTL to committed target when observing it", () => {
        const memory = new TargetMemory(["prey"], { prey: 2 }, { prey: 10 });
        // Case 1: Target observed but NOT committed/engaged target -> uses base TTL
        memory.observe("prey", { id: 5, x: 20, y: 10 }, { x: 0, y: 0 }, grid, "seek_prey", 999);
        assert.equal(memory.record("prey").ttlTicks, 2);

        // Case 2: Target observed and IS committed/engaged target -> uses engaged TTL
        memory.observe("prey", { id: 5, x: 20, y: 10 }, { x: 0, y: 0 }, grid, "seek_prey", 5);
        assert.equal(memory.record("prey").ttlTicks, 10);
    });
    it("AgentIntentMemory passes current mode and target ID through to target observation", () => {
        const memory = new AgentIntentMemory({
            preyTtlTicks: 5,
            engagedPreyTtlTicks: 15
        });
        const state = { obstacleGrid: grid };
        const seeker = { x: 0, y: 0 };
        const prey = { id: 100, x: 30, y: 20 };
        const visibleWorld = { threat: null, prey, food: null, ally: null, ammo: null };

        // Observe with non-engaged mode/target
        memory.update(seeker, state, visibleWorld, "explore", null);
        assert.equal(memory.snapshot().prey.ttlTicks, 5);

        // Observe with engaged mode/target
        memory.update(seeker, state, visibleWorld, "seek_prey", 100);
        assert.equal(memory.snapshot().prey.ttlTicks, 15);
    });
});
