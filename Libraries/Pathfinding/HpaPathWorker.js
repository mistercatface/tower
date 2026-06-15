import { createSabSlotWorkerHost } from "../Workers/SabSlotWorkerHost.js";
import { bakeAbstractGraphFlat, MAX_HPA_GRAPH_NODES } from "./hpaAbstractFlat.js";
export const MAX_HPA_REPLAN_SLOTS = 512;
export const MAX_HPA_PATH_LEN = 512;
export const MAX_HPA_ABSTRACT_LEN = 64;
const MAX_GRAPH_EDGES = MAX_HPA_GRAPH_NODES * 32;
const HPA_DONE = "hpaDone";
const SYNC_NAV_DONE = "syncNavDone";
/**
 * Multi-slot HPA A* worker. Each in-flight replan leases a slot until complete.
 */
export class HpaPathWorker {
    constructor(workerUrl, navGraph) {
        this.navGraph = navGraph;
        this.host = createSabSlotWorkerHost(workerUrl, MAX_HPA_REPLAN_SLOTS);
        this._navKey = "";
        this._navSize = 0;
        this._navSyncPromise = null;
        this._slotFree = [];
        for (let i = 0; i < MAX_HPA_REPLAN_SLOTS; i++) this._slotFree.push(i);
        this._slotOwner = new Array(MAX_HPA_REPLAN_SLOTS).fill(null);
        this.sabPathMetaPool = new SharedArrayBuffer(MAX_HPA_REPLAN_SLOTS * 8);
        this.sabPathColsPool = new SharedArrayBuffer(MAX_HPA_REPLAN_SLOTS * MAX_HPA_PATH_LEN * 2);
        this.sabPathRowsPool = new SharedArrayBuffer(MAX_HPA_REPLAN_SLOTS * MAX_HPA_PATH_LEN * 2);
        this.sabAbstractIdxPool = new SharedArrayBuffer(MAX_HPA_REPLAN_SLOTS * MAX_HPA_ABSTRACT_LEN * 2);
        this.sabGraphNodeColPool = new SharedArrayBuffer(MAX_HPA_REPLAN_SLOTS * MAX_HPA_GRAPH_NODES * 2);
        this.sabGraphNodeRowPool = new SharedArrayBuffer(MAX_HPA_REPLAN_SLOTS * MAX_HPA_GRAPH_NODES * 2);
        this.sabGraphEdgeOffsetsPool = new SharedArrayBuffer(MAX_HPA_REPLAN_SLOTS * (MAX_HPA_GRAPH_NODES + 1) * 4);
        this.sabGraphEdgeTargetsPool = new SharedArrayBuffer(MAX_HPA_REPLAN_SLOTS * MAX_GRAPH_EDGES * 2);
        this.sabGraphEdgeCostsPool = new SharedArrayBuffer(MAX_HPA_REPLAN_SLOTS * MAX_GRAPH_EDGES * 2);
        this.host.worker.onmessage = (e) => {
            const { type, slot, requestId } = e.data;
            if (type === SYNC_NAV_DONE) {
                const resolve = this._navSyncResolve;
                this._navSyncResolve = null;
                this._navSyncPromise = null;
                resolve();
                return;
            }
            if (type === HPA_DONE) this.host.markReady(slot, requestId);
        };
        this.host.worker.postMessage({
            type: "init",
            data: {
                maxSlots: MAX_HPA_REPLAN_SLOTS,
                maxPathLen: MAX_HPA_PATH_LEN,
                maxAbstractLen: MAX_HPA_ABSTRACT_LEN,
                maxGraphNodes: MAX_HPA_GRAPH_NODES,
                maxGraphEdges: MAX_GRAPH_EDGES,
                sabPathMetaPool: this.sabPathMetaPool,
                sabPathColsPool: this.sabPathColsPool,
                sabPathRowsPool: this.sabPathRowsPool,
                sabAbstractIdxPool: this.sabAbstractIdxPool,
                sabGraphNodeColPool: this.sabGraphNodeColPool,
                sabGraphNodeRowPool: this.sabGraphNodeRowPool,
                sabGraphEdgeOffsetsPool: this.sabGraphEdgeOffsetsPool,
                sabGraphEdgeTargetsPool: this.sabGraphEdgeTargetsPool,
                sabGraphEdgeCostsPool: this.sabGraphEdgeCostsPool,
            },
        });
    }
    leaseSlot(owner) {
        const slot = this._slotFree.pop();
        if (slot === undefined) throw new Error(`HpaPathWorker slot pool exhausted (${MAX_HPA_REPLAN_SLOTS} in flight)`);
        this._slotOwner[slot] = owner;
        return slot;
    }
    releaseSlot(slot) {
        this._slotOwner[slot] = null;
        this._slotFree.push(slot);
    }
    inFlightCount() {
        return MAX_HPA_REPLAN_SLOTS - this._slotFree.length;
    }
    _pathMeta(slot) {
        return new Int32Array(this.sabPathMetaPool, slot * 8, 2);
    }
    _pathCols(slot) {
        return new Int16Array(this.sabPathColsPool, slot * MAX_HPA_PATH_LEN * 2, MAX_HPA_PATH_LEN);
    }
    _pathRows(slot) {
        return new Int16Array(this.sabPathRowsPool, slot * MAX_HPA_PATH_LEN * 2, MAX_HPA_PATH_LEN);
    }
    _abstractIdx(slot) {
        return new Int16Array(this.sabAbstractIdxPool, slot * MAX_HPA_ABSTRACT_LEN * 2, MAX_HPA_ABSTRACT_LEN);
    }
    _graphNodeCol(slot) {
        return new Int16Array(this.sabGraphNodeColPool, slot * MAX_HPA_GRAPH_NODES * 2, MAX_HPA_GRAPH_NODES);
    }
    _graphNodeRow(slot) {
        return new Int16Array(this.sabGraphNodeRowPool, slot * MAX_HPA_GRAPH_NODES * 2, MAX_HPA_GRAPH_NODES);
    }
    _graphEdgeOffsets(slot) {
        return new Int32Array(this.sabGraphEdgeOffsetsPool, slot * (MAX_HPA_GRAPH_NODES + 1) * 4, MAX_HPA_GRAPH_NODES + 1);
    }
    _graphEdgeTargets(slot) {
        return new Int16Array(this.sabGraphEdgeTargetsPool, slot * MAX_GRAPH_EDGES * 2, MAX_GRAPH_EDGES);
    }
    _graphEdgeCosts(slot) {
        return new Uint16Array(this.sabGraphEdgeCostsPool, slot * MAX_GRAPH_EDGES * 2, MAX_GRAPH_EDGES);
    }
    async _ensureNavSnapshot() {
        const snapshot = this.navGraph.ensureGridNavSnapshot();
        if (snapshot.cacheKey === this._navKey) return;
        if (this._navSyncPromise) {
            await this._navSyncPromise;
            if (snapshot.cacheKey === this._navKey) return;
        }
        this._navKey = snapshot.cacheKey;
        const size = snapshot.cols * snapshot.rows;
        if (this._navSize !== size) {
            this._navSize = size;
            this.sabBlocked = new SharedArrayBuffer(size);
            this.sabOctileNeighbors = new SharedArrayBuffer(size * 8 * 4);
            this.sabHopOffsets = new SharedArrayBuffer((size + 1) * 4);
            this.sabHopExitIdx = new SharedArrayBuffer(snapshot.hopExitIdx.byteLength || 4);
            this.sabHopCost = new SharedArrayBuffer(snapshot.hopCost.byteLength || 4);
            this.navBlocked = new Uint8Array(this.sabBlocked);
            this.navOctileNeighbors = new Int32Array(this.sabOctileNeighbors);
            this.navHopOffsets = new Int32Array(this.sabHopOffsets);
            this.navHopExitIdx = new Int32Array(this.sabHopExitIdx);
            this.navHopCost = new Uint8Array(this.sabHopCost);
        }
        if (snapshot.hopExitIdx.byteLength > this.sabHopExitIdx.byteLength) {
            this.sabHopExitIdx = new SharedArrayBuffer(snapshot.hopExitIdx.byteLength);
            this.sabHopCost = new SharedArrayBuffer(snapshot.hopCost.byteLength);
            this.navHopExitIdx = new Int32Array(this.sabHopExitIdx);
            this.navHopCost = new Uint8Array(this.sabHopCost);
        }
        this.navBlocked.set(snapshot.blocked);
        this.navOctileNeighbors.set(snapshot.octileNeighbors);
        this.navHopOffsets.set(snapshot.hopOffsets);
        this.navHopExitIdx.set(snapshot.hopExitIdx);
        this.navHopCost.set(snapshot.hopCost);
        this._navSyncPromise = new Promise((resolve) => {
            this._navSyncResolve = resolve;
            this.host.worker.postMessage({
                type: "syncNav",
                cols: snapshot.cols,
                rows: snapshot.rows,
                sabBlocked: this.sabBlocked,
                sabOctileNeighbors: this.sabOctileNeighbors,
                sabHopOffsets: this.sabHopOffsets,
                sabHopExitIdx: this.sabHopExitIdx,
                sabHopCost: this.sabHopCost,
            });
        });
        await this._navSyncPromise;
    }
    async _dispatchAndWait(slot, type, extra) {
        const requestId = this.host.post(slot, { type, ...extra });
        await this.host.waitForSlot(slot, requestId);
    }
    _readCellPath(slot) {
        const pathMeta = this._pathMeta(slot);
        const len = pathMeta[0];
        if (len <= 0) return null;
        const pathCols = this._pathCols(slot);
        const pathRows = this._pathRows(slot);
        const path = new Array(len);
        for (let i = 0; i < len; i++) path[i] = { col: pathCols[i], row: pathRows[i] };
        return path;
    }
    async runLocalAStar(slot, startCol, startRow, targetCol, targetRow, maxPathLen, runId) {
        await this._ensureNavSnapshot();
        await this._dispatchAndWait(slot, "localAStar", { startCol, startRow, targetCol, targetRow, maxPathLen, runId });
        return this._readCellPath(slot);
    }
    async runAbstractAStar(slot, startNodeId, targetNodeId, nodesMap, nodeIds) {
        if (nodeIds.length > MAX_HPA_GRAPH_NODES) throw new Error(`HPA abstract graph has ${nodeIds.length} nodes (max ${MAX_HPA_GRAPH_NODES})`);
        await this._ensureNavSnapshot();
        const baked = bakeAbstractGraphFlat(nodesMap, nodeIds);
        const startIdx = baked.idToIdx.get(startNodeId);
        const targetIdx = baked.idToIdx.get(targetNodeId);
        if (startIdx === undefined || targetIdx === undefined) return null;
        const graphNodeCol = this._graphNodeCol(slot);
        const graphNodeRow = this._graphNodeRow(slot);
        const graphEdgeOffsets = this._graphEdgeOffsets(slot);
        const graphEdgeTargets = this._graphEdgeTargets(slot);
        const graphEdgeCosts = this._graphEdgeCosts(slot);
        graphNodeCol.set(baked.nodeCol);
        graphNodeRow.set(baked.nodeRow);
        graphEdgeOffsets.set(baked.edgeOffsets);
        graphEdgeTargets.fill(0);
        graphEdgeCosts.fill(0);
        graphEdgeTargets.set(baked.edgeTargets);
        graphEdgeCosts.set(baked.edgeCosts);
        await this._dispatchAndWait(slot, "abstractAStar", { startIdx, targetIdx, nodeCount: baked.nodeCount, edgeWrite: baked.edgeWrite });
        const pathMeta = this._pathMeta(slot);
        const len = pathMeta[1];
        if (len <= 0) return null;
        const abstractIdx = this._abstractIdx(slot);
        const path = new Array(len);
        for (let i = 0; i < len; i++) path[i] = nodesMap[nodeIds[abstractIdx[i]]];
        return path;
    }
}
