import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { WorldObstacleGrid, EntityGrid } from "../Libraries/Spatial/spatial.js";
import { PortalLink, FloorPortal, PortalNavGraph } from "../Libraries/Spatial/portals.js";
import {
    bakeNavTopologyLocal,
    navCanStep,
    buildFullRegionGraph,
    packRegionGraphFlat,
    findSabPathProgressIdx,
    createNavLocalView,
    HpaAbstractGraph,
    prepareHpaReplanPrep,
    SearchState,
} from "../Libraries/Navigation/navigation.js";
import { createHpaWorkerSabPools, growHpaCellToRegionSab, hpaPathSlotIdx } from "../Libraries/Pathfinding/hpaWorkerSab.js";
import { HpaBufferManager, HpaReplanPlanner } from "../Libraries/Workers/Navigation/HpaWorkerEntry.js";
import { mockHpaPathWorker } from "./harness/hpaPathSlotHarness.js";
import { mockCircleProp } from "./harness/kineticTickHarness.js";

function portalLinkPairsFromTargetIdx(portalTargetIdx) {
    const collected = PortalNavGraph.collectActiveLinks(portalTargetIdx, new Int32Array(8));
    return collected;
}

function abstractGraphFromPacked(packed, cols) {
    const { nodeCount, nodeIdx, edgeSources, edgeTargets, edgeCosts, edgeWrite, nodeIds } = packed;
    const edgeOffsets = new Int32Array(nodeCount + 1);
    for (let e = 0; e < edgeWrite; e++) edgeOffsets[edgeSources[e] + 1]++;
    let sum = 0;
    for (let i = 0; i < nodeCount; i++) {
        const count = edgeOffsets[i + 1];
        edgeOffsets[i] = sum;
        sum += count;
    }
    edgeOffsets[nodeCount] = sum;
    return new HpaAbstractGraph(nodeIdx, cols, edgeOffsets, edgeTargets, edgeCosts, nodeCount, edgeWrite, nodeIds);
}

function createPortalPlanner(cols, rows) {
    const cellCount = cols * rows;
    const maxPathLen = cellCount;
    const pools = createHpaWorkerSabPools({ maxSlots: 1, maxPathLen, maxAbstractLen: 64, maxGraphNodes: 256, maxGraphEdges: 1024 });
    const buffers = new HpaBufferManager();
    buffers.init({
        maxSlots: 1,
        maxPathLen,
        maxAbstractLen: 64,
        maxGraphNodes: 256,
        maxGraphEdges: 1024,
        maxCellsPerChunk: 16,
        minCellsPerChunk: 0,
        ...pools,
        sabCellToRegionIdx: growHpaCellToRegionSab(pools.sabCellToRegionIdx, cellCount),
    });
    return new HpaReplanPlanner(buffers, new SearchState(cellCount + 2));
}

function portalShortcutGrid() {
    const cols = 24;
    const rows = 10;
    const gapRow = 5;
    const grid = new WorldObstacleGrid(16);
    grid.rebuildFixed(0, 0, cols * 16, rows * 16);
    for (let row = 0; row < rows; row++) {
        if (row === gapRow) continue;
        grid.grid[grid.idx(12, row)] = 1;
    }
    const exitIdx = grid.idx(11, gapRow);
    const entryIdx = grid.idx(13, gapRow);
    PortalLink.setLink(grid, exitIdx, entryIdx);
    return { grid, cols, rows, exitIdx, entryIdx, startIdx: grid.idx(2, gapRow), targetIdx: grid.idx(21, gapRow) };
}

function walledPortalOnlyGrid() {
    const cols = 20;
    const rows = 8;
    const row = 4;
    const grid = new WorldObstacleGrid(16);
    grid.rebuildFixed(0, 0, cols * 16, rows * 16);
    for (let r = 0; r < rows; r++) grid.grid[grid.idx(10, r)] = 1;
    const exitIdx = grid.idx(9, row);
    const entryIdx = grid.idx(11, row);
    PortalLink.setLink(grid, exitIdx, entryIdx);
    return { grid, cols, rows, exitIdx, entryIdx };
}

function farSideOnlyViaPortalGrid() {
    const cols = 20;
    const rows = 8;
    const row = 3;
    const wallCol = 14;
    const grid = new WorldObstacleGrid(16);
    grid.rebuildFixed(0, 0, cols * 16, rows * 16);
    for (let r = 0; r < rows; r++) grid.grid[grid.idx(wallCol, r)] = 1;
    const exitIdx = grid.idx(wallCol - 1, row);
    const entryIdx = grid.idx(wallCol + 1, row);
    PortalLink.setLink(grid, exitIdx, entryIdx);
    return { grid, cols, rows, exitIdx, entryIdx, startIdx: grid.idx(2, row), targetIdx: grid.idx(18, row) };
}

function assertPathContinuous(path, len, frame, topology, portalTargetIdx) {
    for (let i = 1; i < len; i++) {
        const fromIdx = path[i - 1];
        const toIdx = path[i];
        const portalHop = portalTargetIdx[fromIdx] === toIdx;
        assert.ok(portalHop || navCanStep(frame, topology, fromIdx, toIdx), `path discontinuity at step ${i}: ${fromIdx} -> ${toIdx}`);
    }
}

describe("portal nav", () => {
    it("blocksStep prevents walking out of exit but allows walking in", () => {
        const grid = new WorldObstacleGrid(16);
        grid.rebuildFixed(0, 0, 160, 160);
        const exitIdx = grid.idx(2, 2);
        const entryIdx = grid.idx(8, 8);
        PortalLink.setLink(grid, exitIdx, entryIdx);
        const eastNeighbor = exitIdx + 1;
        const westNeighbor = exitIdx - 1;
        assert.equal(PortalLink.blocksStep(grid, exitIdx, eastNeighbor), true);
        assert.equal(PortalLink.blocksStep(grid, westNeighbor, exitIdx), false);
        assert.equal(PortalLink.blocksStep(grid, entryIdx, eastNeighbor), false);
    });

    it("exit cell has no forward octile neighbors after bake", () => {
        const grid = new WorldObstacleGrid(16);
        grid.rebuildFixed(0, 0, 160, 160);
        const exitIdx = grid.idx(2, 2);
        const entryIdx = grid.idx(8, 8);
        PortalLink.setLink(grid, exitIdx, entryIdx);
        const { frame, topology } = bakeNavTopologyLocal(grid);
        assert.equal(navCanStep(frame, topology, exitIdx, exitIdx + 1), false);
        assert.equal(navCanStep(frame, topology, exitIdx, exitIdx + grid.cols), false);
        assert.equal(navCanStep(frame, topology, exitIdx - 1, exitIdx), true);
    });

    it("injectPortalRegionEdges adds abstract shortcut between distant regions", () => {
        const cols = 10;
        const rows = 10;
        const frame = { cols, rows, minX: 0, minY: 0, cellSize: 16 };
        const blocked = new Uint8Array(cols * rows);
        const portalTargetIdx = new Int32Array(cols * rows);
        portalTargetIdx.fill(-1);
        const exitIdx = 2 + 2 * cols;
        const entryIdx = 8 + 8 * cols;
        portalTargetIdx[exitIdx] = entryIdx;
        const navGraph = { canStepIdx: () => true };
        const built = buildFullRegionGraph({ blocked, frame, navGraph, maxCellsPerChunk: 16, minCellsPerChunk: 0, portalTargetIdx });
        const exitNode = built.graph.nodeForCell(exitIdx);
        const entryNode = built.graph.nodeForCell(entryIdx);
        assert.ok(exitNode);
        assert.ok(entryNode);
        assert.notEqual(exitNode.id, entryNode.id);
        const portalEdge = exitNode.edges.find((edge) => edge.targetId === entryNode.id);
        assert.ok(portalEdge);
        assert.equal(portalEdge.cost, PortalNavGraph.COST);
    });

    it("findPortalLegBetweenRegions returns exit and entry cells", () => {
        const cols = 10;
        const rows = 10;
        const frame = { cols, rows, minX: 0, minY: 0, cellSize: 16 };
        const blocked = new Uint8Array(cols * rows);
        const portalTargetIdx = new Int32Array(cols * rows);
        portalTargetIdx.fill(-1);
        const exitIdx = 2 + 2 * cols;
        const entryIdx = 8 + 8 * cols;
        portalTargetIdx[exitIdx] = entryIdx;
        const navGraph = { canStepIdx: () => true };
        const built = buildFullRegionGraph({ blocked, frame, navGraph, maxCellsPerChunk: 16, minCellsPerChunk: 0, portalTargetIdx });
        const packed = packRegionGraphFlat(built.graph, built.graph.cellToNode, frame);
        const scratch = new Int32Array(2);
        const exitRegion = packed.cellToRegion[exitIdx];
        const entryRegion = packed.cellToRegion[entryIdx];
        const { pairs, count } = portalLinkPairsFromTargetIdx(portalTargetIdx);
        const len = PortalNavGraph.findLegBetweenRegions(packed.cellToRegion, pairs, count, exitRegion, entryRegion, scratch);
        assert.equal(len, 2);
        assert.equal(scratch[0], exitIdx);
        assert.equal(scratch[1], entryIdx);
    });

    it("findSabPathProgressIdx advances across portal hop without canStep", () => {
        const grid = new WorldObstacleGrid(16);
        grid.rebuildFixed(0, 0, 160, 160);
        const exitIdx = grid.idx(2, 2);
        const entryIdx = grid.idx(8, 8);
        PortalLink.setLink(grid, exitIdx, entryIdx);
        const worker = mockHpaPathWorker(
            [
                { col: 1, row: 2 },
                { col: 2, row: 2 },
                { col: 8, row: 8 },
            ],
            grid,
        );
        const x = grid.gridCenterXByIdx(entryIdx);
        const y = grid.gridCenterYByIdx(entryIdx);
        const progress = findSabPathProgressIdx(x, y, worker, 0, 3, grid, null);
        assert.ok(progress >= 2);
    });

    it("FloorPortal.tick teleports body from exit to entry", () => {
        const grid = new WorldObstacleGrid(16);
        grid.rebuildFixed(0, 0, 160, 160);
        const exitIdx = grid.idx(2, 2);
        const entryIdx = grid.idx(8, 8);
        PortalLink.setLink(grid, exitIdx, entryIdx);
        const body = mockCircleProp(grid.gridCenterXByIdx(exitIdx), grid.gridCenterYByIdx(exitIdx), 5);
        body._physId = 0;
        const entityGrid = new EntityGrid(grid.cellSize);
        entityGrid.syncBounds(grid);
        entityGrid.insert(body);
        const spatialFrame = { entityGrid };
        const state = { obstacleGrid: grid };
        FloorPortal.tick(state, spatialFrame);
        assert.equal(grid.worldToIdx(body.x, body.y), entryIdx);
    });

    it("resolveRegionLeg builds continuous rep to exit to entry to rep portal leg", () => {
        const { grid, cols, rows, exitIdx, entryIdx } = walledPortalOnlyGrid();
        const { frame, topology } = bakeNavTopologyLocal(grid);
        const navGraph = createNavLocalView(frame, topology);
        const built = buildFullRegionGraph({ blocked: topology.blocked, frame, navGraph, maxCellsPerChunk: 16, minCellsPerChunk: 0, portalTargetIdx: grid.portalTargetIdx });
        const packed = packRegionGraphFlat(built.graph, built.graph.cellToNode, frame);
        const abstractGraph = abstractGraphFromPacked(packed, cols);
        const exitRegion = packed.cellToRegion[exitIdx];
        const entryRegion = packed.cellToRegion[entryIdx];
        assert.notEqual(exitRegion, entryRegion);
        const planner = createPortalPlanner(cols, rows);
        planner.gridSearch.neighbors = topology.octileNeighbors;
        planner.gridSearch.cols = cols;
        const prep = { legMaxCost: Math.max((cols + rows) * 21, 16384) };
        planner.syncPortalLinkPairs(grid.portalTargetIdx);
        const legLen = planner.resolveRegionLeg(planner.gridSearch, abstractGraph, prep, exitRegion, entryRegion, cols, packed.cellToRegion);
        assert.ok(legLen >= 3);
        const leg = planner.localPathScratch;
        assert.equal(leg[0], abstractGraph.nodeIdx[exitRegion]);
        assert.equal(leg[legLen - 1], abstractGraph.nodeIdx[entryRegion]);
        let hopAt = -1;
        for (let i = 1; i < legLen; i++) {
            if (leg[i - 1] === exitIdx && leg[i] === entryIdx) hopAt = i;
        }
        assert.ok(hopAt > 0, "portal leg must include exit immediately followed by entry");
        assertPathContinuous(leg, legLen, frame, topology, grid.portalTargetIdx);
    });

    it("HPA replan stitches followable path through portal shortcut", () => {
        const { grid, cols, rows, exitIdx, entryIdx, startIdx, targetIdx } = portalShortcutGrid();
        const { frame, topology } = bakeNavTopologyLocal(grid);
        const navGraph = createNavLocalView(frame, topology);
        const built = buildFullRegionGraph({ blocked: topology.blocked, frame, navGraph, maxCellsPerChunk: 16, minCellsPerChunk: 0, portalTargetIdx: grid.portalTargetIdx });
        const packed = packRegionGraphFlat(built.graph, built.graph.cellToNode, frame);
        const abstractGraph = abstractGraphFromPacked(packed, cols);
        const planner = createPortalPlanner(cols, rows);
        const context = { frame, topology, graph: abstractGraph, cellToRegion: packed.cellToRegion, portalTargetIdx: grid.portalTargetIdx };
        const result = planner.run(0, context, { startIdx, targetIdx });
        assert.ok(result?.pathLen > 0);
        const len = result.pathLen;
        const pathIdx = hpaPathSlotIdx(planner.buffers.sabPathIdxPool, 0, planner.buffers.maxPathLen);
        assert.equal(pathIdx[0], startIdx);
        assert.equal(pathIdx[len - 1], targetIdx);
        let hopAt = -1;
        for (let i = 1; i < len; i++) {
            if (pathIdx[i - 1] === exitIdx && pathIdx[i] === entryIdx) hopAt = i;
        }
        assert.ok(hopAt > 0, "stitched path must route through portal hop");
        assertPathContinuous(pathIdx, len, frame, topology, grid.portalTargetIdx);
        const prep = prepareHpaReplanPrep(cols, rows, packed.cellToRegion, abstractGraph, startIdx, targetIdx);
        assert.equal(prep.mode, "hpa");
    });

    it("keeps portal-only-reachable region after prune and routes to it", () => {
        const { grid, cols, rows, exitIdx, entryIdx, startIdx, targetIdx } = farSideOnlyViaPortalGrid();
        const { frame, topology } = bakeNavTopologyLocal(grid);
        const navGraph = createNavLocalView(frame, topology);
        const built = buildFullRegionGraph({ blocked: topology.blocked, frame, navGraph, maxCellsPerChunk: 16, minCellsPerChunk: 0, portalTargetIdx: grid.portalTargetIdx });
        const packed = packRegionGraphFlat(built.graph, built.graph.cellToNode, frame);
        assert.ok(built.graph.nodeForCell(entryIdx), "entry region must survive prune");
        assert.ok(built.graph.nodeForCell(targetIdx), "target region must survive prune");
        const abstractGraph = abstractGraphFromPacked(packed, cols);
        const planner = createPortalPlanner(cols, rows);
        const context = { frame, topology, graph: abstractGraph, cellToRegion: packed.cellToRegion, portalTargetIdx: grid.portalTargetIdx };
        const result = planner.run(0, context, { startIdx, targetIdx });
        assert.ok(result?.pathLen > 0, "must find a path to the portal-only far side");
        const len = result.pathLen;
        const pathIdx = hpaPathSlotIdx(planner.buffers.sabPathIdxPool, 0, planner.buffers.maxPathLen);
        assert.equal(pathIdx[0], startIdx);
        assert.equal(pathIdx[len - 1], targetIdx);
        let hopAt = -1;
        for (let i = 1; i < len; i++) {
            if (pathIdx[i - 1] === exitIdx && pathIdx[i] === entryIdx) hopAt = i;
        }
        assert.ok(hopAt > 0, "path must cross the portal hop");
        assertPathContinuous(pathIdx, len, frame, topology, grid.portalTargetIdx);
    });
});
