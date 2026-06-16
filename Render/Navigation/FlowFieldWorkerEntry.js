import { computeFlowField } from "../../Libraries/Pathfinding/flowFieldBfs.js";
import { rebuildFlowNeighborGrid } from "../../Libraries/Pathfinding/flowFieldWindow.js";
let GRID_WIDTH;
let GRID_SIZE;
let FlowToNavIdx;
let NavBlocked;
let OctilePredecessors;
let NavCols;
let NavRows;
let NeighborGrid;
let FlowPool;
let bfsDistances;
let bfsQueue;
let localVectorMap;
let navArenaBound = false;
self.onmessage = function (e) {
    const { type, data, slot, requestId, tx, ty, range } = e.data;
    if (type === "init") {
        GRID_WIDTH = data.GRID_WIDTH;
        GRID_SIZE = data.GRID_SIZE;
        FlowToNavIdx = new Int32Array(data.sabFlowToNav);
        NeighborGrid = new Int32Array(data.sabNeighbors);
        FlowPool = new Uint8Array(data.sabFlowPool);
        bfsDistances = new Int32Array(GRID_SIZE);
        localVectorMap = new Uint8Array(GRID_SIZE);
        bfsQueue = new Int32Array(GRID_SIZE);
        return;
    }
    if (type === "bindFlowNavArena") {
        NavBlocked = new Uint8Array(data.sabBlocked);
        OctilePredecessors = new Int32Array(data.sabOctilePredecessors);
        NavCols = data.navCols;
        NavRows = data.navRows;
        navArenaBound = true;
        return;
    }
    if (type === "syncFlowWindow") {
        if (!navArenaBound) throw new Error("syncFlowWindow requires bound flow nav arena");
        rebuildFlowNeighborGrid(FlowToNavIdx, OctilePredecessors, NeighborGrid, GRID_SIZE, NavCols, NavRows);
        self.postMessage({ type: "flowWindowDone" });
        return;
    }
    if (type === "updateFlow") {
        if (!navArenaBound) throw new Error("updateFlow requires bound flow nav arena");
        const offset = slot * GRID_SIZE;
        const vectorMap = FlowPool.subarray(offset, offset + GRID_SIZE);
        computeFlowField(vectorMap, {
            gridWidth: GRID_WIDTH,
            gridSize: GRID_SIZE,
            flowToNavIdx: FlowToNavIdx,
            navBlocked: NavBlocked,
            neighborGrid: NeighborGrid,
            tx,
            ty,
            range,
            bfsDistances,
            bfsQueue,
            localVectorMap,
        });
        self.postMessage({ type: "flowDone", slot, requestId });
    }
};
