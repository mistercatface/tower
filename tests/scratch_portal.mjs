import { WorldObstacleGrid as ObstacleGrid } from "../Libraries/Spatial/spatial.js";
import { HpaReplanPlanner } from "../Libraries/Navigation/HpaWorkerEntry.js";
import { createHpaWorkerSabPools, growHpaCellToRegionSab } from "../Libraries/Navigation/hpaWorkerSab.js";
import { SearchState, buildFullRegionGraph, packRegionGraphFlat, HpaAbstractGraph, bakeNavTopologyLocal, createNavLocalView, buildNavComponentMap } from "../Libraries/Navigation/navigation.js";
import { HpaBufferManager } from "../Libraries/Navigation/HpaWorkerEntry.js";
import { PortalLink } from "../Libraries/Spatial/portals.js";

function testPortal() {
    const cols = 20;
    const rows = 10;
    const grid = new ObstacleGrid(16);
    grid.rebuildFixed(0, 0, cols * 16, rows * 16);
    // Draw a wall
    for (let r = 0; r < rows; r++) grid.grid[grid.idx(5, r)] = 1;
    
    // Add portal
    const exitIdx = grid.idx(2, 5);
    const entryIdx = grid.idx(8, 5);
    PortalLink.setLink(grid, exitIdx, entryIdx);

    const { frame, topology } = bakeNavTopologyLocal(grid);
    const navGraph = createNavLocalView(frame, topology);
    
    const regionGraph = buildFullRegionGraph({
        blocked: topology.blocked,
        frame,
        navGraph,
        maxCellsPerChunk: 16,
        minCellsPerChunk: 0,
        activePortalPairs: grid.activePortalPairs,
        activePortalCount: new Int32Array([grid.activePortalCount])
    });
    // Check if region A (left side) was pruned!
    console.log("Left side cell 102 region:", regionGraph.cellToNode[102]);
    const packed = packRegionGraphFlat(regionGraph.graph, regionGraph.cellToNode, frame);
    const abstractGraph = new HpaAbstractGraph(packed.nodeIdx, cols, packed.edgeOffsets, packed.edgeTargets, packed.edgeCosts, packed.nodeCount, packed.edgeWrite, packed.nodeIds);
    
    const cellCount = cols * rows;
    const pools = createHpaWorkerSabPools({ maxSlots: 1, maxPathLen: cellCount, maxAbstractLen: 64, maxGraphNodes: 256, maxGraphEdges: 1024 });
    const buffers = new HpaBufferManager();
    buffers.init({
        maxSlots: 1, maxPathLen: cellCount, maxAbstractLen: 64, maxGraphNodes: 256, maxGraphEdges: 1024, maxCellsPerChunk: 16, minCellsPerChunk: 0,
        ...pools,
        sabCellToRegionIdx: growHpaCellToRegionSab(pools.sabCellToRegionIdx, cellCount)
    });
    
    const planner = new HpaReplanPlanner(buffers, new SearchState(cellCount + 2));
    const cellToComponent = buildNavComponentMap(topology.blocked, topology.octileNeighbors, cols, rows, grid.activePortalPairs, new Int32Array([grid.activePortalCount]));
    const context = { frame, topology, graph: abstractGraph, cellToRegion: packed.cellToRegion, cellToComponent, activePortalPairs: grid.activePortalPairs, activePortalCount: new Int32Array([grid.activePortalCount]) };
    
    const startIdx = grid.idx(1, 5);
    const targetIdx = grid.idx(18, 5);
    cellToComponent[startIdx] = 0;
    cellToComponent[targetIdx] = 1;
    
    const result = planner.run(0, context, { startIdx, targetIdx });
    const pathArray = Array.from(new Int32Array(pools.sabPathIdxPool)).slice(0, result ? result.pathLen : 0);
    console.log("Path:", pathArray);
    console.log("Exit Region:", packed.cellToRegion[exitIdx], "Entry Region:", packed.cellToRegion[entryIdx]);
    console.log("Start Region:", packed.cellToRegion[startIdx], "Target Region:", packed.cellToRegion[targetIdx]);
    console.log("Path length:", result ? result.pathLen : "null");
}

testPortal();
