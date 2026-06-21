import { PathfindingWorkerClient } from "../Workers/PathfindingWorkerClient.js";
import { expandRegionDamageBounds } from "./hpaRegionGraph.js";
import { gridFrameFromGrid } from "./GridNavSnapshot.js";
import { gridNavCacheKey, isNavTopologyReady } from "../Spatial/grid/gridNavEpoch.js";
import { createNavTopologySabArena, growNavTopologyVertexSab, packNavTopologyFromGrid, navCanStep } from "./navTopologySab.js";
import { createHpaWorkerSabPools, growHpaCellToRegionSab, hpaPathSlotMeta, hpaPathSlotCols, hpaPathSlotRows, hpaPathSlotAbstractIdx } from "./hpaWorkerSab.js";
import { gridSettings } from "../../Config/world.js";
import { navEdgePoolSabByteLength, packEdgePoolToSab } from "../Spatial/grid/navEdgePoolSab.js";
export const MAX_HPA_REPLAN_SLOTS = 512;
export const MAX_HPA_PATH_LEN = 512;
export const MAX_HPA_ABSTRACT_LEN = 64;
export const MAX_HPA_GRAPH_NODES = 4096;
const MAX_GRAPH_EDGES = MAX_HPA_GRAPH_NODES * 32;
const HPA_DONE = "hpaDone";
const SYNC_NAV_DONE = "syncNavDone";
const GRAPH_PATCH_DONE = "graphPatchDone";
const GRAPH_PATCH_ERROR = "graphPatchError";
/**
 * Multi-slot HPA worker — persistent nav topology + abstract graph on worker thread.
 */
export class HpaPathWorker {
    constructor(workerUrl, navGraph) {
        this.workerUrl = workerUrl;
        this.navGraph = navGraph;
        this._syncedNavCacheKey = "";
        this._inFlightNavCacheKey = "";
        this._navSize = 0;
        this._gridFrame = null;
        this.sabEdgePool = new SharedArrayBuffer(navEdgePoolSabByteLength(4));
        this.navEdgePoolBytes = new Uint8Array(this.sabEdgePool);
        this._edgePoolSabRefs = 0;
        this._navSyncPromise = null;
        this._navArena = null;
        this._workerNavArenaBound = false;
        this._workerBoundNavSize = 0;
        this._workerBoundEdgePoolSab = 0;
        this._deferFullNavSync = false;
        this._deferNavBounds = null;
        this._graphEpoch = -1;
        this._graphPatchTargetEpoch = -1;
        this._graphPatchChain = Promise.resolve();
        this._graphSize = 0;
        this._damagePadding = 12;
        this._shutDown = false;
        this._topologySyncTarget = null;
        this.graphIdToIdx = new Map();
        this.graphNodeIds = [];
        this.graphNodeCount = 0;
        Object.assign(
            this,
            createHpaWorkerSabPools({
                maxSlots: MAX_HPA_REPLAN_SLOTS,
                maxPathLen: MAX_HPA_PATH_LEN,
                maxAbstractLen: MAX_HPA_ABSTRACT_LEN,
                maxGraphNodes: MAX_HPA_GRAPH_NODES,
                maxGraphEdges: MAX_GRAPH_EDGES,
            }),
        );
        this.graphCellToRegion = new Int16Array(this.sabCellToRegionIdx);
        this._slotFree = [];
        for (let i = 0; i < MAX_HPA_REPLAN_SLOTS; i++) this._slotFree.push(i);
        /** @type {(object | null)[]} */
        this._replanResults = new Array(MAX_HPA_REPLAN_SLOTS).fill(null);
        this.protocol = new PathfindingWorkerClient(workerUrl, MAX_HPA_REPLAN_SLOTS, "HpaPathWorker", (data) => this._handleWorkerMessage(data));
        this.host = this.protocol.host;
        this.protocol.postMessage({ type: "init", data: this._workerInitData() });
    }
    _workerInitData() {
        return {
            maxSlots: MAX_HPA_REPLAN_SLOTS,
            maxPathLen: MAX_HPA_PATH_LEN,
            maxAbstractLen: MAX_HPA_ABSTRACT_LEN,
            maxGraphNodes: MAX_HPA_GRAPH_NODES,
            maxGraphEdges: MAX_GRAPH_EDGES,
            maxCellsPerChunk: gridSettings.maxCellsPerChunk,
            minCellsPerChunk: gridSettings.minCellsPerChunk,
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
            sabCellToRegionIdx: this.sabCellToRegionIdx,
        };
    }
    _handleWorkerMessage(data) {
        const { type, slot, requestId } = data;
        if (type === SYNC_NAV_DONE) {
            this._syncedNavCacheKey = this._inFlightNavCacheKey || gridNavCacheKey(this.navGraph);
            this._inFlightNavCacheKey = "";
            const topologyHandle = this.getNavTopology();
            if (this._topologySyncTarget) this._topologySyncTarget.bindWorkerSync(this._gridFrame, topologyHandle);
            const resolve = this._navSyncResolve;
            this._navSyncResolve = null;
            this._navSyncPromise = null;
            resolve();
            if (this._deferFullNavSync) {
                this._deferFullNavSync = false;
                this.scheduleNavTopologySync(this.navGraph, this._deferNavBounds);
                this._deferNavBounds = null;
            }
            return;
        }
        if (type === GRAPH_PATCH_DONE) {
            this.graphNodeCount = data.nodeCount;
            this.graphNodeIds = data.nodeIds ?? [];
            this.graphIdToIdx = new Map();
            for (let i = 0; i < this.graphNodeIds.length; i++) this.graphIdToIdx.set(this.graphNodeIds[i], i);
            this._graphEpoch = this._graphPatchTargetEpoch;
            const expectedSize = this.navGraph.cols * this.navGraph.rows;
            if (expectedSize > 0 && this._graphSize !== expectedSize) this._ensureGraphCellBuffers(expectedSize);
            const resolve = this._graphPatchResolve;
            this._graphPatchResolve = null;
            resolve?.();
            return;
        }
        if (type === GRAPH_PATCH_ERROR) {
            console.error("HPA region graph patch failed:", data.message);
            const resolve = this._graphPatchResolve;
            this._graphPatchResolve = null;
            resolve?.();
            return;
        }
        if (type === HPA_DONE) {
            this._replanResults[slot] = data.replanResult ?? null;
            this.protocol.markReady(slot, requestId);
            return;
        }
    }
    _ensureGraphCellBuffers(size) {
        if (this._graphSize === size) return;
        this._graphSize = size;
        this.sabCellToRegionIdx = growHpaCellToRegionSab(this.sabCellToRegionIdx, size);
        this.graphCellToRegion = new Int16Array(this.sabCellToRegionIdx);
    }
    _postGraphPatch(type, payload, graphEpoch) {
        const run = () => {
            this._graphPatchTargetEpoch = graphEpoch;
            return new Promise((resolve) => {
                this._graphPatchResolve = resolve;
                this.protocol.postMessage({ type, sabCellToRegionIdx: this.sabCellToRegionIdx, ...payload });
            });
        };
        this._graphPatchChain = this._graphPatchChain.then(run, run);
        return this._graphPatchChain;
    }
    /** @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid @param {import("../DataStructures/CellRect.js").CellBounds | null} damageBounds @param {number} graphEpoch @param {number} seedWorldX @param {number} seedWorldY @param {boolean} fullGraph */
    async syncObstacleNavGraph(grid, damageBounds, graphEpoch, seedWorldX, seedWorldY, fullGraph) {
        await this.scheduleNavTopologySyncAwait(grid, fullGraph ? null : damageBounds);
        const size = grid.cols * grid.rows;
        this._ensureGraphCellBuffers(size);
        this.setPruneSeed(seedWorldX, seedWorldY);
        if (fullGraph) {
            await this._postGraphPatch(
                "buildRegionGraphFull",
                { gridFrameKey: this._gridFrame.key, damagePadding: this._damagePadding, minCellsPerChunk: gridSettings.minCellsPerChunk, seedWorldX, seedWorldY },
                graphEpoch,
            );
            return;
        }
        const box = expandRegionDamageBounds(damageBounds, this._gridFrame, this._damagePadding);
        await this._postGraphPatch("patchRegionGraph", { gridFrameKey: this._gridFrame.key, bounds: box, seedWorldX: seedWorldX ?? null, seedWorldY: seedWorldY ?? null }, graphEpoch);
    }
    async awaitGraphReady() {
        if (this._navSyncPromise) await this._navSyncPromise;
        await this._graphPatchChain;
    }
    setPruneSeed(worldX, worldY) {
        this._pruneSeedWorldX = worldX;
        this._pruneSeedWorldY = worldY;
    }
    /** @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid */
    isRegionGraphReady(grid = this.navGraph) {
        const size = grid.cols * grid.rows;
        if (size <= 0 || this.graphNodeCount <= 0 || this._graphSize !== size) return false;
        return this.sabCellToRegionIdx.byteLength >> 1 >= size;
    }
    getRegionGraphDebugView(grid) {
        const size = grid.cols * grid.rows;
        if (!this.isRegionGraphReady(grid)) return null;
        const nodeCount = this.graphNodeCount;
        const nodeCol = new Int16Array(this.sabPersistGraphNodeCol, 0, nodeCount);
        const nodeRow = new Int16Array(this.sabPersistGraphNodeRow, 0, nodeCount);
        const edgeOffsets = new Int32Array(this.sabPersistGraphEdgeOffsets, 0, nodeCount + 1);
        const edgeWrite = nodeCount > 0 ? edgeOffsets[nodeCount] : 0;
        const edgeTargets = new Int16Array(this.sabPersistGraphEdgeTargets, 0, edgeWrite);
        const cellToRegion = size > 0 ? new Int16Array(this.sabCellToRegionIdx, 0, size) : this.graphCellToRegion;
        const edges = [];
        for (let i = 0; i < nodeCount; i++) for (let e = edgeOffsets[i]; e < edgeOffsets[i + 1]; e++) edges.push({ sourceIdx: i, targetIdx: edgeTargets[e] });
        const topology = this.getNavTopology();
        const blocked = topology?.blocked ?? grid.grid;
        const navCaches = { navCardinalOpen: this._navArena.cardinalOpen, vertexPassability: this._navArena.vertexPassability };
        const regionCanStep = topology
            ? (fromCol, fromRow, toCol, toRow) => navCanStep(this._gridFrame, topology, fromCol, fromRow, toCol, toRow) || navCanStep(this._gridFrame, topology, toCol, toRow, fromCol, fromRow)
            : (fromCol, fromRow, toCol, toRow) => grid.canStep(fromCol, fromRow, toCol, toRow, navCaches) || grid.canStep(toCol, toRow, fromCol, fromRow, navCaches);
        return {
            cols: grid.cols,
            rows: grid.rows,
            minX: grid.minX,
            minY: grid.minY,
            cellSize: grid.cellSize,
            grid: blocked,
            regionCanStep,
            cellToRegion,
            nodeCount,
            nodeCol,
            nodeRow,
            nodeIds: this.graphNodeIds,
            edges,
            gridToWorld(col, row) {
                return grid.gridToWorld(col, row);
            },
        };
    }
    leaseSlot() {
        const slot = this._slotFree.pop();
        if (slot === undefined) throw new Error(`HpaPathWorker slot pool exhausted (${MAX_HPA_REPLAN_SLOTS} in flight)`);
        return slot;
    }
    releaseSlot(slot) {
        this._slotFree.push(slot);
    }
    releaseOwnedPathSlot(navState) {
        if (navState.pathSlot >= 0) {
            this.releaseSlot(navState.pathSlot);
            navState.pathSlot = -1;
            navState.pathLen = 0;
        }
    }
    pathLength(slot) {
        return this._pathMeta(slot)[0];
    }
    pathCol(slot, i) {
        return this._pathCols(slot)[i];
    }
    pathRow(slot, i) {
        return this._pathRows(slot)[i];
    }
    abstractPathLen(slot) {
        return this._pathMeta(slot)[1];
    }
    abstractPathIdx(slot, i) {
        return this._abstractIdx(slot)[i];
    }
    graphNodeCol(idx) {
        return new Int16Array(this.sabPersistGraphNodeCol, 0, this.graphNodeCount)[idx];
    }
    graphNodeRow(idx) {
        return new Int16Array(this.sabPersistGraphNodeRow, 0, this.graphNodeCount)[idx];
    }
    _pathMeta(slot) {
        return hpaPathSlotMeta(this.sabPathMetaPool, slot);
    }
    _pathCols(slot) {
        return hpaPathSlotCols(this.sabPathColsPool, slot, MAX_HPA_PATH_LEN);
    }
    _pathRows(slot) {
        return hpaPathSlotRows(this.sabPathRowsPool, slot, MAX_HPA_PATH_LEN);
    }
    _abstractIdx(slot) {
        return hpaPathSlotAbstractIdx(this.sabAbstractIdxPool, slot, MAX_HPA_ABSTRACT_LEN);
    }
    _ensureNavEdgePoolSab(refCount) {
        const byteLen = navEdgePoolSabByteLength(refCount);
        if (this.sabEdgePool.byteLength >= byteLen) return;
        this.sabEdgePool = new SharedArrayBuffer(byteLen);
        this.navEdgePoolBytes = new Uint8Array(this.sabEdgePool);
    }
    _packNavEdgePoolForWorker(grid) {
        const refCount = grid.edgeStore.pool.length;
        this._ensureNavEdgePoolSab(refCount);
        this._edgePoolSabRefs = packEdgePoolToSab(grid.edgeStore, this.navEdgePoolBytes);
    }
    _syncNavArenaFields() {
        const arena = this._navArena;
        this.sabBlocked = arena.sabBlocked;
        this.sabGridFill = arena.sabGridFill;
        this.sabFloorKind = arena.sabFloorKind;
        this.sabFloorFacing = arena.sabFloorFacing;
        this.sabEdgeSlots = arena.sabEdgeSlots;
        this.sabOctileNeighbors = arena.sabOctileNeighbors;
        this.sabOctilePredecessors = arena.sabOctilePredecessors;
        this.sabCardinalOpen = arena.sabCardinalOpen;
        this.sabVertexPassability = arena.sabVertexPassability;
    }
    _ensureNavBuffers(size, vertCount, edgePoolRefs = 4) {
        this._ensureNavEdgePoolSab(edgePoolRefs);
        if (this._navSize !== size) {
            this._navSize = size;
            this._navArena = createNavTopologySabArena(size, vertCount);
        } else growNavTopologyVertexSab(this._navArena, vertCount);
        this._syncNavArenaFields();
    }
    getNavTopology() {
        return this._navArena?.topologyHandle ?? null;
    }
    getNavArena() {
        return this._navArena;
    }
    /** @param {import("../Navigation/NavTopology.js").NavTopology | null} target */
    setTopologySyncTarget(target) {
        this._topologySyncTarget = target;
    }
    /** @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid */
    ensureNavArenaForGrid(grid) {
        const size = grid.cols * grid.rows;
        if (size <= 0) return;
        const vertCount = (grid.cols + 1) * (grid.rows + 1);
        this._ensureNavBuffers(size, vertCount, Math.max(grid.edgeStore.pool.length, 4));
    }
    getGridFrame() {
        return this._gridFrame;
    }
    getNavBlockedSab() {
        return this.sabBlocked;
    }
    getNavOctilePredecessorsSab() {
        return this.sabOctilePredecessors;
    }
    async scheduleNavTopologySyncAwait(grid = this.navGraph, damageBounds = null) {
        while (!this._shutDown && !isNavTopologyReady(this, grid)) {
            this.scheduleNavTopologySync(grid, damageBounds);
            if (this._shutDown) return;
            if (this._navSyncPromise) await this._navSyncPromise;
            else break;
        }
    }
    _navTopologySyncMessage(grid, cacheKey, rebindArena, damageBounds) {
        this._gridFrame = gridFrameFromGrid(grid);
        const payload = {
            type: "buildNavTopology",
            navCacheKey: cacheKey,
            gridFrame: this._gridFrame,
            edgePoolCount: this._edgePoolSabRefs,
            passageEdgeCount: grid.edgeStore.passageEdgeCount,
            rebindArena,
            damageBounds,
        };
        if (!rebindArena) return payload;
        return {
            ...payload,
            sabBlocked: this.sabBlocked,
            sabCardinalOpen: this.sabCardinalOpen,
            sabVertexPassability: this.sabVertexPassability,
            sabOctileNeighbors: this.sabOctileNeighbors,
            sabOctilePredecessors: this.sabOctilePredecessors,
            sabEdgePool: this.sabEdgePool,
            sabGridFill: this.sabGridFill,
            sabFloorKind: this.sabFloorKind,
            sabFloorFacing: this.sabFloorFacing,
            sabEdgeSlots: this.sabEdgeSlots,
        };
    }
    scheduleNavTopologySync(grid = this.navGraph, damageBounds = null) {
        if (this._shutDown || isNavTopologyReady(this, grid)) return;
        if (this._navSyncPromise) {
            this._deferFullNavSync = true;
            this._deferNavBounds = damageBounds;
            return;
        }
        const size = grid.cols * grid.rows;
        const vertCount = (grid.cols + 1) * (grid.rows + 1);
        this._inFlightNavCacheKey = gridNavCacheKey(grid);
        const edgePoolRefs = Math.max(grid.edgeStore.pool.length, 4);
        this._ensureNavBuffers(size, vertCount, edgePoolRefs);
        const rebindArena = !this._workerNavArenaBound || this._workerBoundNavSize !== size || this._workerBoundEdgePoolSab !== this.sabEdgePool.byteLength;
        packNavTopologyFromGrid(grid, this._navArena, rebindArena ? null : damageBounds);
        this._packNavEdgePoolForWorker(grid);
        if (rebindArena) {
            this._workerNavArenaBound = true;
            this._workerBoundNavSize = size;
            this._workerBoundEdgePoolSab = this.sabEdgePool.byteLength;
        }
        this._navSyncPromise = new Promise((resolve) => {
            this._navSyncResolve = resolve;
            this.protocol.postMessage(this._navTopologySyncMessage(grid, this._inFlightNavCacheKey, rebindArena, rebindArena ? null : damageBounds));
        });
    }
    async _ensureWorkerGraphReady(graphEpoch) {
        await this.awaitGraphReady();
        return this._graphEpoch >= graphEpoch && this.graphNodeCount > 0;
    }
    recycleWorker() {
        console.warn("HpaPathWorker: Web Worker hung or timed out. Recycling worker thread...");
        this._recycleWorkerThread();
    }
    _recycleWorkerThread() {
        this.protocol.recycleWorker();
        this._workerNavArenaBound = false;
        this._syncedNavCacheKey = "";
        this._inFlightNavCacheKey = "";
        this._graphEpoch = -1;
        this._graphPatchTargetEpoch = -1;
        this.protocol.invalidateSlots();
        if (this._navSyncResolve) {
            this._navSyncResolve();
            this._navSyncResolve = null;
        }
        if (this._graphPatchResolve) {
            this._graphPatchResolve();
            this._graphPatchResolve = null;
        }
        this.protocol.postMessage({ type: "init", data: this._workerInitData() });
    }
    async _dispatchAndWait(slot, type, extra) {
        const requestId = this.protocol.postSlot(slot, { type, ...extra });
        let timer;
        const mainPromise = this.protocol.waitForSlot(slot, requestId);
        const timeoutPromise = new Promise((_, reject) => {
            timer = setTimeout(() => {
                reject(new Error("Worker request timeout"));
            }, 2500);
        });
        try {
            await Promise.race([mainPromise, timeoutPromise]);
        } catch (err) {
            if (err.message === "Worker request timeout") this.recycleWorker();
            throw err;
        } finally {
            clearTimeout(timer);
        }
    }
    async runOneShotReplan(slot, request) {
        await this._dispatchAndWait(slot, "replan", request.toWorkerPayload());
        const result = this._replanResults[slot];
        this._replanResults[slot] = null;
        if (!result) return null;
        return { complete: true, result };
    }
    async requestPath(request, navState) {
        await this.scheduleNavTopologySyncAwait(request.obstacleGrid, null);
        if (!isNavTopologyReady(this, request.obstacleGrid)) return null;
        this.releaseOwnedPathSlot(navState);
        if (!(await this._ensureWorkerGraphReady(request.graphEpoch))) return null;
        const slot = this.leaseSlot();
        let workerOut = null;
        try {
            workerOut = await this.runOneShotReplan(slot, request);
        } catch (err) {
            this.releaseSlot(slot);
            throw err;
        }
        if (!workerOut) {
            this.releaseSlot(slot);
            return null;
        }
        workerOut.result.pathSlot = slot;
        return workerOut;
    }
    /** Release pending slot waiters and worker handlers before thread termination (tests). */
    shutdown() {
        this._shutDown = true;
        this.protocol.shutdown();
        this._navSyncPromise = null;
        if (this._navSyncResolve) {
            this._navSyncResolve();
            this._navSyncResolve = null;
        }
        this._graphPatchChain = Promise.resolve();
        if (this._graphPatchResolve) {
            this._graphPatchResolve();
            this._graphPatchResolve = null;
        }
    }
}
