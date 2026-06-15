import { createSabSlotWorkerHost } from "../Workers/SabSlotWorkerHost.js";
import { packHpaGraphForWorker, MAX_HPA_GRAPH_NODES } from "./hpaAbstractFlat.js";
import { packBlockedFromGrid, snapshotNavCacheKey } from "./GridNavSnapshot.js";
export const MAX_HPA_REPLAN_SLOTS = 512;
export const MAX_HPA_PATH_LEN = 512;
export const MAX_HPA_ABSTRACT_LEN = 64;
const MAX_GRAPH_EDGES = MAX_HPA_GRAPH_NODES * 32;
const HPA_DONE = "hpaDone";
const SYNC_NAV_DONE = "syncNavDone";
const GRAPH_SYNC_DONE = "graphSyncDone";
/**
 * Multi-slot HPA worker — persistent nav snapshot + abstract graph on worker thread.
 */
export class HpaPathWorker {
    constructor(workerUrl, navGraph) {
        this.navGraph = navGraph;
        this.host = createSabSlotWorkerHost(workerUrl, MAX_HPA_REPLAN_SLOTS);
        this._navKey = "";
        this._navSize = 0;
        this._navSyncPromise = null;
        this._graphEpoch = -1;
        this._graphSyncPromise = null;
        this.graphIdToIdx = new Map();
        this.graphNodeIds = [];
        this.graphNodeCol = new Int16Array(0);
        this.graphNodeRow = new Int16Array(0);
        this.graphNodeCount = 0;
        this._slotFree = [];
        for (let i = 0; i < MAX_HPA_REPLAN_SLOTS; i++) this._slotFree.push(i);
        this._slotOwner = new Array(MAX_HPA_REPLAN_SLOTS).fill(null);
        this.sabPathMetaPool = new SharedArrayBuffer(MAX_HPA_REPLAN_SLOTS * 8);
        this.sabPathColsPool = new SharedArrayBuffer(MAX_HPA_REPLAN_SLOTS * MAX_HPA_PATH_LEN * 2);
        this.sabPathRowsPool = new SharedArrayBuffer(MAX_HPA_REPLAN_SLOTS * MAX_HPA_PATH_LEN * 2);
        this.sabAbstractIdxPool = new SharedArrayBuffer(MAX_HPA_REPLAN_SLOTS * MAX_HPA_ABSTRACT_LEN * 2);
        this.sabPersistGraphNodeCol = new SharedArrayBuffer(MAX_HPA_GRAPH_NODES * 2);
        this.sabPersistGraphNodeRow = new SharedArrayBuffer(MAX_HPA_GRAPH_NODES * 2);
        this.sabPersistGraphEdgeOffsets = new SharedArrayBuffer((MAX_HPA_GRAPH_NODES + 1) * 4);
        this.sabPersistGraphEdgeTargets = new SharedArrayBuffer(MAX_GRAPH_EDGES * 2);
        this.sabPersistGraphEdgeCosts = new SharedArrayBuffer(MAX_GRAPH_EDGES * 2);
        this.sabPersistGraphEdgeSources = new SharedArrayBuffer(MAX_GRAPH_EDGES * 2);
        this.sabReplanLegMetaPool = new SharedArrayBuffer(MAX_HPA_REPLAN_SLOTS * 32 * 4);
        this.host.worker.onmessage = (e) => {
            const { type, slot, requestId } = e.data;
            if (type === SYNC_NAV_DONE) {
                const resolve = this._navSyncResolve;
                this._navSyncResolve = null;
                this._navSyncPromise = null;
                resolve();
                return;
            }
            if (type === GRAPH_SYNC_DONE) {
                const resolve = this._graphSyncResolve;
                this._graphSyncResolve = null;
                this._graphSyncPromise = null;
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
                sabPersistGraphNodeCol: this.sabPersistGraphNodeCol,
                sabPersistGraphNodeRow: this.sabPersistGraphNodeRow,
                sabPersistGraphEdgeOffsets: this.sabPersistGraphEdgeOffsets,
                sabPersistGraphEdgeTargets: this.sabPersistGraphEdgeTargets,
                sabPersistGraphEdgeCosts: this.sabPersistGraphEdgeCosts,
                sabPersistGraphEdgeSources: this.sabPersistGraphEdgeSources,
                sabReplanLegMetaPool: this.sabReplanLegMetaPool,
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
    _ensureNavBuffers(size, hopExitLen, hopCostLen, vertCount) {
        if (this._navSize !== size) {
            this._navSize = size;
            this.sabBlocked = new SharedArrayBuffer(size);
            this.sabOctileNeighbors = new SharedArrayBuffer(size * 8 * 4);
            this.sabHopOffsets = new SharedArrayBuffer((size + 1) * 4);
            this.sabHopExitIdx = new SharedArrayBuffer(Math.max(hopExitLen, 4));
            this.sabHopCost = new SharedArrayBuffer(Math.max(hopCostLen, 4));
            this.sabCardinalOpen = new SharedArrayBuffer(size);
            this.sabVertexPassability = new SharedArrayBuffer(Math.max(vertCount, 4));
            this.navBlocked = new Uint8Array(this.sabBlocked);
            this.navOctileNeighbors = new Int32Array(this.sabOctileNeighbors);
            this.navHopOffsets = new Int32Array(this.sabHopOffsets);
            this.navHopExitIdx = new Int32Array(this.sabHopExitIdx);
            this.navHopCost = new Uint8Array(this.sabHopCost);
            this.navCardinalOpen = new Uint8Array(this.sabCardinalOpen);
            this.navVertexPassability = new Uint8Array(this.sabVertexPassability);
        } else if (hopExitLen > this.sabHopExitIdx.byteLength) {
            this.sabHopExitIdx = new SharedArrayBuffer(hopExitLen);
            this.sabHopCost = new SharedArrayBuffer(hopCostLen);
            this.navHopExitIdx = new Int32Array(this.sabHopExitIdx);
            this.navHopCost = new Uint8Array(this.sabHopCost);
        }
        if (vertCount > this.sabVertexPassability.byteLength) {
            this.sabVertexPassability = new SharedArrayBuffer(vertCount);
            this.navVertexPassability = new Uint8Array(this.sabVertexPassability);
        }
    }
    scheduleNavTopologySync(grid = this.navGraph) {
        const cacheKey = snapshotNavCacheKey(grid);
        if (cacheKey === this._navKey) return;
        if (this._navSyncPromise) return;
        this._navKey = cacheKey;
        const size = grid.cols * grid.rows;
        const vertCount = (grid.cols + 1) * (grid.rows + 1);
        const blocked = packBlockedFromGrid(grid);
        const hops = this._packHopCsr(grid, blocked);
        this._ensureNavBuffers(size, hops.hopExitIdx.byteLength, hops.hopCost.byteLength, vertCount);
        this.navBlocked.set(blocked);
        this.navCardinalOpen.set(grid.navCardinalOpen);
        this.navVertexPassability.set(grid.vertexPassability);
        this.navHopOffsets.set(hops.hopOffsets);
        this.navHopExitIdx.set(hops.hopExitIdx);
        this.navHopCost.set(hops.hopCost);
        this._navSyncPromise = new Promise((resolve) => {
            this._navSyncResolve = resolve;
            this.host.worker.postMessage({
                type: "buildNavSnapshot",
                cols: grid.cols,
                rows: grid.rows,
                sabBlocked: this.sabBlocked,
                sabCardinalOpen: this.sabCardinalOpen,
                sabVertexPassability: this.sabVertexPassability,
                sabHopOffsets: this.sabHopOffsets,
                sabHopExitIdx: this.sabHopExitIdx,
                sabHopCost: this.sabHopCost,
                sabOctileNeighbors: this.sabOctileNeighbors,
            });
        });
    }
    _packHopCsr(grid, blocked) {
        const { cols, rows } = grid;
        const size = cols * rows;
        const hopOffsets = new Int32Array(size + 1);
        const hopExitIdx = [];
        const hopCost = [];
        let write = 0;
        for (let idx = 0; idx < size; idx++) {
            hopOffsets[idx] = write;
            const col = idx % cols;
            const row = (idx / cols) | 0;
            const hops = grid.getBoundaryHops(col, row);
            if (hops)
                for (let i = 0; i < hops.length; i++) {
                    const { exitCol, exitRow, cost } = hops[i];
                    if (blocked[exitCol + exitRow * cols]) continue;
                    hopExitIdx.push(exitCol + exitRow * cols);
                    hopCost.push(cost);
                    write++;
                }
        }
        hopOffsets[size] = write;
        return { hopOffsets, hopExitIdx: Int32Array.from(hopExitIdx), hopCost: Uint8Array.from(hopCost) };
    }
    async _ensureWorkerNavReady() {
        this.scheduleNavTopologySync();
        if (this._navSyncPromise) await this._navSyncPromise;
    }
    syncAbstractGraph(navigator, graphEpoch) {
        if (graphEpoch === this._graphEpoch && this.graphNodeCount > 0) return;
        const nodeIds = Object.keys(navigator.nodesMap).filter((id) => !id.startsWith("__hpa_"));
        if (nodeIds.length > MAX_HPA_GRAPH_NODES) throw new Error(`HPA abstract graph has ${nodeIds.length} nodes (max ${MAX_HPA_GRAPH_NODES})`);
        const packed = packHpaGraphForWorker(navigator.nodesMap, nodeIds);
        this.graphIdToIdx = packed.idToIdx;
        this.graphNodeIds = packed.nodeIds;
        this.graphNodeCol = packed.nodeCol;
        this.graphNodeRow = packed.nodeRow;
        this.graphNodeCount = packed.nodeCount;
        this._graphEdgeWrite = packed.edgeWrite;
        this._graphEpoch = graphEpoch;
        const persistNodeCol = new Int16Array(this.sabPersistGraphNodeCol);
        const persistNodeRow = new Int16Array(this.sabPersistGraphNodeRow);
        const persistEdgeSources = new Int16Array(this.sabPersistGraphEdgeSources);
        const persistEdgeTargets = new Int16Array(this.sabPersistGraphEdgeTargets);
        const persistEdgeCosts = new Uint16Array(this.sabPersistGraphEdgeCosts);
        persistNodeCol.set(packed.nodeCol);
        persistNodeRow.set(packed.nodeRow);
        persistEdgeSources.set(packed.edgeSources);
        persistEdgeTargets.set(packed.edgeTargets);
        persistEdgeCosts.set(packed.edgeCosts);
        this._graphSyncPromise = new Promise((resolve) => {
            this._graphSyncResolve = resolve;
            this.host.worker.postMessage({ type: "syncAbstractGraph", nodeCount: packed.nodeCount, edgeWrite: packed.edgeWrite });
        });
    }
    async _ensureWorkerGraphReady(navigator, graphEpoch) {
        this.syncAbstractGraph(navigator, graphEpoch);
        if (this._graphSyncPromise) await this._graphSyncPromise;
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
    _readAbstractIdx(slot) {
        const pathMeta = this._pathMeta(slot);
        const len = pathMeta[1];
        if (len <= 0) return [];
        const abstractIdx = this._abstractIdx(slot);
        const out = new Array(len);
        for (let i = 0; i < len; i++) out[i] = abstractIdx[i];
        return out;
    }
    getGraphMeta() {
        return { nodeCount: this.graphNodeCount, nodeIds: this.graphNodeIds, nodeCol: this.graphNodeCol, nodeRow: this.graphNodeRow, idToIdx: this.graphIdToIdx };
    }
    _readTempLegs(slot) {
        const meta = new Int32Array(this.sabReplanLegMetaPool, slot * 32 * 4, 32);
        const legCount = meta[0];
        const pathCols = this._pathCols(slot);
        const pathRows = this._pathRows(slot);
        const tempLegs = new Map();
        for (let i = 0; i < legCount; i++) {
            const base = 1 + i * 4;
            const from = meta[base];
            const to = meta[base + 1];
            const len = meta[base + 2];
            const offset = meta[base + 3];
            const path = new Array(len);
            for (let j = 0; j < len; j++) path[j] = { col: pathCols[offset + j], row: pathRows[offset + j] };
            tempLegs.set(`${from},${to}`, path);
        }
        return tempLegs;
    }
    async runOneShotReplan(slot, prep, nav, graphEpoch) {
        await this._ensureWorkerNavReady();
        await this._ensureWorkerGraphReady(nav, graphEpoch);
        const payload = { mode: prep.mode, startCol: prep.startCol, startRow: prep.startRow, targetCol: prep.targetCol, targetRow: prep.targetRow, localMaxLen: 96 };
        if (prep.mode === "hpa") {
            payload.startCandidates = prep.startCandidates;
            payload.targetCandidates = prep.targetCandidates;
            payload.regionConnectMaxLen = prep.regionConnectMaxLen;
        }
        await this._dispatchAndWait(slot, "replan", payload);
        if (prep.mode === "local") return nav._workerReplanResult(this._readCellPath(slot), prep, []);
        const abstractIdx = this._readAbstractIdx(slot);
        const cellPath = nav.stitchAbstractCellPath(abstractIdx, prep, this._readTempLegs(slot));
        return nav._workerReplanResult(cellPath, prep, abstractIdx);
    }
}
