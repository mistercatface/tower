import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createCenteredGridFrame, gridToWorldInCenteredFrame, worldToGridInCenteredFrame } from "../Libraries/Spatial/grid/GridCoords.js";
import { rebuildFlowNeighborGrid, rebuildFlowToNavIdx } from "../Libraries/Pathfinding/flowFieldWindow.js";
import { sampleFlowDirection } from "../Libraries/Pathfinding/sampleFlowDirection.js";
import { OCTILE_NEIGHBOR_GRID_LAYOUT } from "../Libraries/Pathfinding/neighborGridLayout.js";
import { gridReachabilityBfs } from "../Libraries/Pathfinding/gridReachabilityBfs.js";
import { FlatGridView } from "../Libraries/Pathfinding/FlatGridView.js";

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

    it("rebuilds flow predecessor neighbors through the octile layout", () => {
        const flowToNavIdx = new Int32Array([0, 1]);
        const octilePredecessors = new Int32Array(OCTILE_NEIGHBOR_GRID_LAYOUT.bufferByteLength(2) / 4).fill(-1);
        const neighborGrid = new Int32Array(OCTILE_NEIGHBOR_GRID_LAYOUT.bufferByteLength(2) / 4).fill(-1);
        octilePredecessors[OCTILE_NEIGHBOR_GRID_LAYOUT.cellOffset(0, 1)] = 1;
        octilePredecessors[OCTILE_NEIGHBOR_GRID_LAYOUT.cellOffset(1, 3)] = 0;

        rebuildFlowNeighborGrid(flowToNavIdx, octilePredecessors, neighborGrid, flowToNavIdx.length, 2, 1, OCTILE_NEIGHBOR_GRID_LAYOUT);

        assert.equal(neighborGrid[OCTILE_NEIGHBOR_GRID_LAYOUT.cellOffset(0, 1)], 1);
        assert.equal(neighborGrid[OCTILE_NEIGHBOR_GRID_LAYOUT.cellOffset(1, 3)], 0);
    });

    it("checks reachability through a neighbor layout instead of hardcoded stride", () => {
        const neighborGrid = new Int32Array(OCTILE_NEIGHBOR_GRID_LAYOUT.bufferByteLength(2) / 4).fill(-1);
        neighborGrid[OCTILE_NEIGHBOR_GRID_LAYOUT.cellOffset(0, 1)] = 1;
        const grid = new FlatGridView(2, 1, { neighbors: neighborGrid, neighborLayout: OCTILE_NEIGHBOR_GRID_LAYOUT });

        assert.equal(gridReachabilityBfs(grid, 0, 1, () => false), true);
    });
});
