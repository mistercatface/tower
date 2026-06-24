import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createFlowReachStaleCache } from "../Libraries/Navigation/flowReachStaleCache.js";
import { readTargetSteps } from "../Libraries/Navigation/flowTargetSteps.js";

function grid(cols = 8, rows = 8, cellSize = 16) {
    return {
        cols,
        rows,
        cellSize,
        worldCol: (x) => Math.floor(x / cellSize),
        worldRow: (y) => Math.floor(y / cellSize),
    };
}

function cell(col, row, cellSize = 16) {
    return { x: col * cellSize + cellSize / 2, y: row * cellSize + cellSize / 2 };
}

function stateWithFlow(flowFieldGrid) {
    return {
        obstacleGrid: grid(),
        flowFieldGrid,
        simTick: 0,
    };
}

function sequenceFlowGrid(results, tokenRef = { value: "topology-a" }) {
    let callCount = 0;
    return {
        get callCount() {
            return callCount;
        },
        readFlowStepsForTargetInto(out) {
            const result = results[Math.min(callCount, results.length - 1)];
            callCount++;
            out.slot = result.slot ?? 0;
            out.steps = result.steps ?? null;
            out.ready = result.ready;
            return out;
        },
        flowReachCacheToken() {
            return tokenRef.value;
        },
    };
}

describe("flow target steps", () => {
    it("uses committed route path length before requesting flow", () => {
        const flowFieldGrid = sequenceFlowGrid([{ ready: true, steps: 99 }]);
        const state = stateWithFlow(flowFieldGrid);
        const target = { id: "food-1", ...cell(4, 1) };

        const steps = readTargetSteps(
            state,
            cell(1, 1),
            target,
            "seek_food",
            { mode: "seek_food", targetId: "food-1" },
            { hasRoute: true, pathLen: 6, destReached: false },
            createFlowReachStaleCache(),
            32,
            { slot: null, steps: null, ready: false },
        );

        assert.equal(steps, 6);
        assert.equal(flowFieldGrid.callCount, 0);
    });

    it("reuses stale flow steps only for the same agent cell and topology", () => {
        const tokenRef = { value: "topology-a" };
        const flowFieldGrid = sequenceFlowGrid(
            [
                { ready: true, steps: 7 },
                { ready: false },
                { ready: false },
                { ready: false },
            ],
            tokenRef,
        );
        const state = stateWithFlow(flowFieldGrid);
        const staleCache = createFlowReachStaleCache();
        const flowResult = { slot: null, steps: null, ready: false };
        const target = { id: "threat-1", ...cell(4, 1) };

        assert.equal(readTargetSteps(state, cell(1, 1), target, "flee", null, null, staleCache, 32, flowResult), 7);
        state.simTick = 1;
        assert.equal(readTargetSteps(state, cell(1, 1), target, "flee", null, null, staleCache, 32, flowResult), 7);
        assert.equal(readTargetSteps(state, cell(2, 1), target, "flee", null, null, staleCache, 32, flowResult), 2);

        tokenRef.value = "topology-b";
        assert.equal(readTargetSteps(state, cell(1, 1), target, "flee", null, null, staleCache, 32, flowResult), 3);
    });

    it("falls back to octile distance when flow is not ready and no stale value matches", () => {
        const state = stateWithFlow(sequenceFlowGrid([{ ready: false }]));
        const target = { id: "food-1", ...cell(4, 1) };

        const steps = readTargetSteps(
            state,
            cell(1, 1),
            target,
            "seek_food",
            null,
            null,
            createFlowReachStaleCache(),
            32,
            { slot: null, steps: null, ready: false },
        );

        assert.equal(steps, 3);
    });
});
