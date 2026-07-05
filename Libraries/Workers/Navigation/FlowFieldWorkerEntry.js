import { computeFlowField, rebuildFlowNeighborGrid } from "../../Navigation/navigation.js";
import { OCTILE_NEIGHBOR_GRID_LAYOUT } from "../../Navigation/navigation.js";
export class FlowBufferManager {
    constructor() {
        this.gridWidth = 0;
        this.gridSize = 0;
        this.flowToNavIdx = null;
        this.neighborGrid = null;
        this.neighborLayout = OCTILE_NEIGHBOR_GRID_LAYOUT;
        this.flowPool = null;
        this.bfsDistances = null;
        this.localVectorMap = null;
        this.bfsQueue = null;
        this.flowDistPool = null;
    }
    init(data) {
        this.gridWidth = data.GRID_WIDTH;
        this.gridSize = data.GRID_SIZE;
        this.flowToNavIdx = new Int32Array(data.sabFlowToNav);
        this.neighborGrid = new Int32Array(data.sabNeighbors);
        this.flowPool = new Uint8Array(data.sabFlowPool);
        // Scratch allocations
        this.bfsDistances = new Int32Array(this.gridSize);
        this.localVectorMap = new Uint8Array(this.gridSize);
        this.bfsQueue = new Int32Array(this.gridSize);
        this.flowDistPool = new Int32Array(data.sabFlowDistPool);
    }
    getVectorMap(slot) {
        const offset = slot * this.gridSize;
        return this.flowPool.subarray(offset, offset + this.gridSize);
    }
    getDistanceMap(slot) {
        const offset = slot * this.gridSize;
        return this.flowDistPool.subarray(offset, offset + this.gridSize);
    }
}
export class FlowTopologyArena {
    constructor() {
        this.navBlocked = null;
        this.octilePredecessors = null;
        this.navCols = 0;
        this.navRows = 0;
        this.navArenaBound = false;
    }
    bind(data) {
        this.navBlocked = new Uint8Array(data.sabBlocked);
        this.octilePredecessors = new Int32Array(data.sabOctilePredecessors);
        this.navCols = data.navCols;
        this.navRows = data.navRows;
        this.navArenaBound = true;
    }
    syncFlowWindow(buffers) {
        if (!this.navArenaBound) throw new Error("syncFlowWindow requires bound flow nav arena");
        rebuildFlowNeighborGrid(buffers.flowToNavIdx, this.octilePredecessors, buffers.neighborGrid, buffers.gridSize, this.navCols, this.navRows, buffers.neighborLayout);
    }
}
export class FlowFieldWorker {
    constructor() {
        this.buffers = new FlowBufferManager();
        this.topology = new FlowTopologyArena();
    }
    onMessage(e) {
        const { type, data, slot, requestId, tx, ty, range } = e.data;
        if (type === "init") {
            this.buffers.init(data);
            return;
        }
        if (type === "bindFlowNavArena") {
            this.topology.bind(data);
            return;
        }
        if (type === "syncFlowWindow") {
            this.topology.syncFlowWindow(this.buffers);
            self.postMessage({ type: "flowWindowDone" });
            return;
        }
        if (type === "updateFlow") {
            if (!this.topology.navArenaBound) throw new Error("updateFlow requires bound flow nav arena");
            const vectorMap = this.buffers.getVectorMap(slot);
            computeFlowField(vectorMap, {
                gridWidth: this.buffers.gridWidth,
                gridSize: this.buffers.gridSize,
                flowToNavIdx: this.buffers.flowToNavIdx,
                navBlocked: this.topology.navBlocked,
                neighborGrid: this.buffers.neighborGrid,
                neighborLayout: this.buffers.neighborLayout,
                tx,
                ty,
                range,
                bfsDistances: this.buffers.bfsDistances,
                bfsQueue: this.buffers.bfsQueue,
                localVectorMap: this.buffers.localVectorMap,
                distancesOut: this.buffers.getDistanceMap(slot),
            });
            self.postMessage({ type: "flowDone", slot, requestId });
        }
    }
}
const worker = new FlowFieldWorker();
self.onmessage = (e) => worker.onMessage(e);
