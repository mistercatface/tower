import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { WorldObstacleGrid } from "../Libraries/Spatial/spatial.js";
import { PortalLink } from "../Libraries/Spatial/portals.js";
import {
    bakeNavTopologyLocal,
    rebuildFlowNeighborGrid,
    rebuildFlowToNavIdx,
    computeFlowField,
    OCTILE_NEIGHBOR_GRID_LAYOUT,
    snapshotWorldToIdx,
} from "../Libraries/Navigation/navigation.js";
import { createCenteredGridFrame } from "../Libraries/Spatial/spatial.js";

describe("flow field portals and belts", () => {
    it("computes flow field traversing portals backwards", () => {
        const cols = 24;
        const rows = 10;
        const gapRow = 5;
        const grid = new WorldObstacleGrid(16);
        grid.rebuildFixed(0, 0, cols * 16, rows * 16);
        
        // Build wall at col 12
        for (let row = 0; row < rows; row++) {
            if (row === gapRow) continue;
            grid.grid[grid.idx(12, row)] = 1;
        }
        
        // Portal exit and entry
        const exitIdx = grid.idx(11, gapRow);
        const entryIdx = grid.idx(13, gapRow);
        PortalLink.setLink(grid, exitIdx, entryIdx);

        // Bake topology to get predecessors
        const { frame: navFrame, topology } = bakeNavTopologyLocal(grid);
        
        // Setup flow window spanning the wall/portal
        const flowFrame = createCenteredGridFrame(16, cols * 16, rows * 16, 0, 0);
        const flowSize = flowFrame.cols * flowFrame.rows;
        const flowToNavIdx = new Int32Array(flowSize);
        rebuildFlowToNavIdx(flowToNavIdx, flowFrame, navFrame);
        
        // Build neighbor grid
        const neighborGrid = new Int32Array(OCTILE_NEIGHBOR_GRID_LAYOUT.bufferByteLength(flowSize) / 4).fill(-1);
        rebuildFlowNeighborGrid(flowToNavIdx, topology.octilePredecessors, neighborGrid, flowSize, navFrame.cols, navFrame.rows, OCTILE_NEIGHBOR_GRID_LAYOUT);

        // Target cell to the right of the wall (col 18, row 5)
        const targetIdx = grid.idx(18, gapRow);
        
        // Find flow indices for target, exit, and entry
        let flowTarget = -1;
        let flowExit = -1;
        let flowEntry = -1;
        for (let i = 0; i < flowSize; i++) {
            if (flowToNavIdx[i] === targetIdx) flowTarget = i;
            if (flowToNavIdx[i] === exitIdx) flowExit = i;
            if (flowToNavIdx[i] === entryIdx) flowEntry = i;
        }

        assert.ok(flowTarget >= 0);
        assert.ok(flowExit >= 0);
        assert.ok(flowEntry >= 0);
        const vectorMap = new Uint8Array(flowSize);
        const bfsDistances = new Int32Array(flowSize);
        const localVectorMap = new Uint8Array(flowSize);
        const bfsQueue = new Int32Array(flowSize);

        // Run flow field computation
        const tx = flowTarget % cols;
        const ty = (flowTarget / cols) | 0;
        
        computeFlowField(vectorMap, {
            gridWidth: cols,
            gridSize: flowSize,
            flowToNavIdx,
            navBlocked: topology.blocked,
            neighborGrid,
            neighborLayout: OCTILE_NEIGHBOR_GRID_LAYOUT,
            tx,
            ty,
            range: 50,
            bfsDistances,
            bfsQueue,
            localVectorMap,
            distancesOut: null,
            activePortalPairs: grid.activePortalPairs,
            activePortalCount: new Int32Array([grid.activePortalCount])
        });

        // Verify that the flow successfully propagated across the portal wall
        const startFlowIdx = flowToNavIdx.indexOf(grid.idx(2, gapRow));
        assert.ok(startFlowIdx >= 0);
        
        // The start cell is on the left side of the wall, target is on the right.
        // It must have a valid distance and a vector pointing towards the portal.
        assert.notEqual(bfsDistances[startFlowIdx], -1, "flow must propagate to the far side of the portal");
        assert.notEqual(bfsDistances[flowEntry], -1, "portal entry must have a valid flow distance");
    });
});
