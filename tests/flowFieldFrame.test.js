import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createCenteredGridFrame, gridToWorldInCenteredFrame, worldToGridInCenteredFrame } from "../Libraries/Spatial/grid/GridCoords.js";
import { rebuildFlowToNavIdx } from "../Libraries/Pathfinding/flowFieldWindow.js";
import { sampleFlowDirection } from "../Libraries/Pathfinding/sampleFlowDirection.js";

describe("flow field centered grid frame", () => {
    it("converts between world and flow cells", () => {
        const frame = createCenteredGridFrame(16, 64, 64, 100, 200);
        const world = gridToWorldInCenteredFrame(frame, 2, 1);
        assert.deepEqual(worldToGridInCenteredFrame(frame, world.x, world.y), { col: 2, row: 1 });
    });

    it("maps flow cells into nav frame cells", () => {
        const flowFrame = createCenteredGridFrame(16, 32, 32, 0, 0);
        const navFrame = { minX: -16, minY: -16, cellSize: 16, cols: 4, rows: 4, key: "test" };
        const flowToNavIdx = new Int32Array(4);
        rebuildFlowToNavIdx(flowToNavIdx, flowFrame, navFrame);
        assert.deepEqual(Array.from(flowToNavIdx), [0, 1, 4, 5]);
    });

    it("samples flow direction from a centered frame", () => {
        const frame = createCenteredGridFrame(16, 32, 32, 0, 0);
        const flowField = new Uint8Array([5, 5, 5, 5]);
        const dir = sampleFlowDirection(0, 0, flowField, frame);
        assert.ok(dir);
        assert.ok(dir.x > 0.99);
        assert.ok(Math.abs(dir.y) < 0.01);
    });
});
