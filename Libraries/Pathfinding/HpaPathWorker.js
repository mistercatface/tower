import { createSabSlotWorkerHost } from "../Workers/SabSlotWorkerHost.js";
import { bakeAbstractGraphFlat, MAX_HPA_GRAPH_NODES } from "./hpaAbstractFlat.js";
export const MAX_HPA_PATH_LEN = 512;
export const MAX_HPA_ABSTRACT_LEN = 64;
const HPA_DONE = "hpaDone";
const SYNC_NAV_DONE = "syncNavDone";
const SLOT = 0;
/**
 * Worker-backed local / abstract A* for HPA replans.
 * Async slot wait — callers await runLocalAStar / runAbstractAStar.
 */
export class HpaPathWorker {
    /**
     * @param {URL | string} workerUrl
     * @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} navGraph
     */
    constructor(workerUrl, navGraph) {
        this.navGraph = navGraph;
        this.host = createSabSlotWorkerHost(workerUrl, 1);
        this._navKey = "";
        this._cols = 0;
        this._rows = 0;
        this._navSize = 0;
        this._navSyncPromise = null;
        this.sabPathMeta = new SharedArrayBuffer(8);
        this.pathMeta = new Int32Array(this.sabPathMeta);
        this.sabPathCols = new SharedArrayBuffer(MAX_HPA_PATH_LEN * 2);
        this.sabPathRows = new SharedArrayBuffer(MAX_HPA_PATH_LEN * 2);
        this.pathCols = new Int16Array(this.sabPathCols);
        this.pathRows = new Int16Array(this.sabPathRows);
        this.sabAbstractIdx = new SharedArrayBuffer(MAX_HPA_ABSTRACT_LEN * 2);
        this.abstractIdx = new Int16Array(this.sabAbstractIdx);
        this.sabGraphNodeCol = new SharedArrayBuffer(MAX_HPA_GRAPH_NODES * 2);
        this.sabGraphNodeRow = new SharedArrayBuffer(MAX_HPA_GRAPH_NODES * 2);
        this.sabGraphEdgeOffsets = new SharedArrayBuffer((MAX_HPA_GRAPH_NODES + 1) * 4);
        this.sabGraphEdgeTargets = new SharedArrayBuffer(MAX_HPA_GRAPH_NODES * 32 * 2);
        this.sabGraphEdgeCosts = new SharedArrayBuffer(MAX_HPA_GRAPH_NODES * 32 * 2);
        this.graphNodeCol = new Int16Array(this.sabGraphNodeCol);
        this.graphNodeRow = new Int16Array(this.sabGraphNodeRow);
        this.graphEdgeOffsets = new Int32Array(this.sabGraphEdgeOffsets);
        this.graphEdgeTargets = new Int16Array(this.sabGraphEdgeTargets);
        this.graphEdgeCosts = new Uint16Array(this.sabGraphEdgeCosts);
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
                sabPathMeta: this.sabPathMeta,
                sabPathCols: this.sabPathCols,
                sabPathRows: this.sabPathRows,
                sabAbstractIdx: this.sabAbstractIdx,
                sabGraphNodeCol: this.sabGraphNodeCol,
                sabGraphNodeRow: this.sabGraphNodeRow,
                sabGraphEdgeOffsets: this.sabGraphEdgeOffsets,
                sabGraphEdgeTargets: this.sabGraphEdgeTargets,
                sabGraphEdgeCosts: this.sabGraphEdgeCosts,
                maxPathLen: MAX_HPA_PATH_LEN,
                maxAbstractLen: MAX_HPA_ABSTRACT_LEN,
                maxGraphNodes: MAX_HPA_GRAPH_NODES,
            },
        });
    }
    async _ensureNavSnapshot() {
        const snapshot = this.navGraph.ensureGridNavSnapshot();
        if (snapshot.cacheKey === this._navKey) return;
        if (this._navSyncPromise) {
            await this._navSyncPromise;
            if (snapshot.cacheKey === this._navKey) return;
        }
        this._navKey = snapshot.cacheKey;
        this._cols = snapshot.cols;
        this._rows = snapshot.rows;
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
    async _dispatchAndWait(type, extra) {
        const requestId = this.host.post(SLOT, { type, ...extra });
        await this.host.waitForSlot(SLOT, requestId);
    }
    _readCellPath() {
        const len = this.pathMeta[0];
        if (len <= 0) return null;
        const path = new Array(len);
        for (let i = 0; i < len; i++) path[i] = { col: this.pathCols[i], row: this.pathRows[i] };
        return path;
    }
    async runLocalAStar(startCol, startRow, targetCol, targetRow, maxPathLen, runId) {
        await this._ensureNavSnapshot();
        await this._dispatchAndWait("localAStar", { startCol, startRow, targetCol, targetRow, maxPathLen, runId });
        return this._readCellPath();
    }
    /**
     * @param {string} startNodeId
     * @param {string} targetNodeId
     * @param {Record<string, { col: number, row: number, edges: { targetId: string, cost: number }[] }>} nodesMap
     * @param {string[]} nodeIds
     * @returns {Promise<object[] | null>}
     */
    async runAbstractAStar(startNodeId, targetNodeId, nodesMap, nodeIds) {
        await this._ensureNavSnapshot();
        const baked = bakeAbstractGraphFlat(nodesMap, nodeIds);
        const startIdx = baked.idToIdx.get(startNodeId);
        const targetIdx = baked.idToIdx.get(targetNodeId);
        if (startIdx === undefined || targetIdx === undefined) return null;
        this.graphNodeCol.set(baked.nodeCol);
        this.graphNodeRow.set(baked.nodeRow);
        this.graphEdgeOffsets.set(baked.edgeOffsets);
        this.graphEdgeTargets.fill(0);
        this.graphEdgeCosts.fill(0);
        this.graphEdgeTargets.set(baked.edgeTargets);
        this.graphEdgeCosts.set(baked.edgeCosts);
        await this._dispatchAndWait("abstractAStar", { startIdx, targetIdx, nodeCount: baked.nodeCount, edgeWrite: baked.edgeWrite });
        const len = this.pathMeta[1];
        if (len <= 0) return null;
        const path = new Array(len);
        for (let i = 0; i < len; i++) path[i] = nodesMap[nodeIds[this.abstractIdx[i]]];
        return path;
    }
}
