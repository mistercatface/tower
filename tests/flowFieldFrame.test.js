import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createCenteredGridFrame, gridToWorldInCenteredFrame, worldToGridInCenteredFrame } from "../Libraries/Spatial/grid/GridCoords.js";
import { rebuildFlowNeighborGrid, rebuildFlowToNavIdx } from "../Libraries/Pathfinding/flowFieldWindow.js";
import { FlowFieldWindow } from "../Libraries/Pathfinding/flowFieldWindow.js";
import { FlowCacheManager } from "../Libraries/Pathfinding/flowCacheManager.js";
import { sampleFlowDirection } from "../Libraries/Pathfinding/sampleFlowDirection.js";
import { OCTILE_NEIGHBOR_GRID_LAYOUT } from "../Libraries/Pathfinding/neighborGridLayout.js";
import { FlatGridView } from "../Libraries/Pathfinding/FlatGridView.js";
import { bfsTypedIndices } from "../Libraries/DataStructures/gridBfs.js";

function gridReachabilityBfs(grid, startIdx, targetIdx, blockedFn) {
    if (startIdx === targetIdx) return true;
    const layout = grid.neighborLayout;
    const neighborGrid = grid.neighbors;
    const res = bfsTypedIndices(startIdx, grid.cellCount, (idx, visited, queuePush) => {
        if (idx === targetIdx) return true;
        const base = layout.cellBase(idx);
        for (let dir = 0; dir < layout.directionCount; dir++) {
            const nIdx = neighborGrid[base + dir];
            if (nIdx !== -1 && !visited[nIdx] && !blockedFn(nIdx)) {
                queuePush(nIdx);
            }
        }
    });
    return res === true;
}

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

    it("does not begin duplicate topology syncs while a matching window is pending", () => {
        const window = new FlowFieldWindow(16, 32, 32);

        assert.equal(window.beginTopologySync("nav-a"), true);
        assert.equal(window.beginTopologySync("nav-a"), false);
        window.markReady();
        assert.equal(window.beginTopologySync("nav-a"), false);
        assert.equal(window.beginTopologySync("nav-b"), true);
    });

    it("keeps separate flow slots for the same target with different ranges", () => {
        const window = new FlowFieldWindow(16, 64, 64);
        window.beginTopologySync("nav-a");
        window.markReady();
        const cache = new FlowCacheManager(4, window);
        const posts = [];
        const protocol = {
            postSlot(slot, payload) {
                posts.push({ slot, payload });
            },
        };
        const target = window.gridToWorld(2, 2);

        const shortSlot = cache.getOrRequestSlot(target.x, target.y, 2, protocol);
        const longSlot = cache.getOrRequestSlot(target.x, target.y, 999999, protocol);
        const shortSlotAgain = cache.getOrRequestSlot(target.x, target.y, 2, protocol);

        assert.notEqual(shortSlot, longSlot);
        assert.equal(shortSlotAgain, shortSlot);
        assert.deepEqual(
            posts.map((post) => post.payload.range),
            [2, 999999],
        );
    });
});
