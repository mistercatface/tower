import { computeFlowField } from "../../Libraries/Pathfinding/flowFieldBfs.js";
let GRID_WIDTH;
let GRID_SIZE;
let FlowToNavIdx;
let NavBlocked;
let NeighborGrid;
let FlowPool;
let bfsDistances;
let bfsQueue;
let localVectorMap;
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
    if (type === "bindNavSab") {
        NavBlocked = new Uint8Array(data.sabNavBlocked);
        return;
    }
    if (type === "updateFlow") {
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
