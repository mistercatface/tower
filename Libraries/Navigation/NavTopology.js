import { gridFrameFromGrid } from "../Pathfinding/GridNavSnapshot.js";
import { createNavSimView } from "../Pathfinding/navSimView.js";
import { bakeNavTopologyIntoArena } from "../Pathfinding/bakeNavTopology.js";
import { createNavTopologySabArena, navTopologyFromArena, packNavTopologyFromGrid } from "../Pathfinding/navTopologySab.js";
import { navCanStep } from "../Pathfinding/navTopologySab.js";
import { boundaryBlocksStepFrom } from "../Spatial/grid/boundaryOccupancy.js";
import { isNavTopologyReady } from "../Spatial/grid/gridNavEpoch.js";
/** @typedef {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} WorldObstacleGrid */
/** @typedef {import("../Pathfinding/HpaPathWorker.js").HpaPathWorker} HpaPathWorker */
/** @typedef {import("../DataStructures/CellRect.js").CellBounds} CellBounds */
/** @type {WeakMap<WorldObstacleGrid, import("../Pathfinding/navTopologySab.js").NavTopologySabArena>} */
const localBakeArenas = new WeakMap();
/**
 * Baked nav walkability — one object for worker-synced and in-process bakes.
 * Octile reads for movement; cardinal/vertex reads for belt-mouth heuristics.
 */
export class NavTopology {
    /** @param {WorldObstacleGrid} grid @param {{ worker?: HpaPathWorker | null }} [options] */
    constructor(grid, { worker = null } = {}) {
        this.grid = grid;
        /** @type {HpaPathWorker | null} */
        this._worker = worker ?? null;
        /** @type {import("../Pathfinding/GridNavSnapshot.js").GridFrame | null} */
        this._frame = null;
        /** @type {import("../Pathfinding/navTopologySab.js").NavTopology | null} */
        this._topology = null;
        /** @type {"worker" | "local" | null} */
        this._source = worker ? "worker" : null;
    }
    /** @param {HpaPathWorker} worker */
    bindWorker(worker) {
        this._worker = worker;
        this._source = "worker";
    }
    /** @param {import("../Pathfinding/GridNavSnapshot.js").GridFrame} frame @param {import("../Pathfinding/navTopologySab.js").NavTopology} topology */
    bindWorkerSync(frame, topology) {
        this._frame = frame;
        this._topology = topology;
        this._source = "worker";
    }
    invalidateLocalBake() {
        if (this._source !== "local") return;
        if (this.grid._navTopologyRef === this) this.grid._navTopologyRef = null;
        this._frame = null;
        this._topology = null;
        this._source = null;
    }
    isReady() {
        if (this._worker) return isNavTopologyReady(this._worker, this.grid);
        return !!(this._frame && this._topology);
    }
    get wallRevision() {
        return this.grid.wallGridRevision;
    }
    get frame() {
        if (this._worker?.getGridFrame()) return this._worker.getGridFrame();
        return this._frame;
    }
    get topology() {
        if (this._worker) return this._worker.getNavTopology();
        return this._topology;
    }
    get navCardinalOpen() {
        return this._worker?.getNavArena()?.cardinalOpen ?? this._localArena()?.cardinalOpen ?? null;
    }
    get vertexPassability() {
        return this._worker?.getNavArena()?.vertexPassability ?? this._localArena()?.vertexPassability ?? null;
    }
    get cardinalOpen() {
        return this.navCardinalOpen;
    }
    /** Octile CSR step — movement, HPA, flow. */
    canStep(fromIdx, toIdx) {
        const frame = this.frame;
        const topology = this.topology;
        if (!frame || !topology) return false;
        return navCanStep(frame, topology, fromIdx, toIdx);
    }
    /** Cardinal / vertex step — belt mouths, map-gen heuristics. */
    canStepCardinal(fromIdx, toIdx) {
        const cardinalOpen = this.navCardinalOpen;
        const vertexPassability = this.vertexPassability;
        if (!cardinalOpen || !vertexPassability) return false;
        return !boundaryBlocksStepFrom(this.grid, cardinalOpen, vertexPassability, fromIdx, toIdx);
    }
    /**
     * In-process bake using the same functions as the worker (authoring / map-gen).
     *
     * @param {number | null} [idx]
     */
    bakeInProcess(idx = null) {
        const arena = ensureLocalBakeArena(this.grid);
        packNavTopologyFromGrid(this.grid, arena, idx);
        const frame = gridFrameFromGrid(this.grid);
        const simView = createNavSimView(
            frame,
            arena.gridFill,
            arena.floorKind,
            arena.floorFacing,
            arena.edgeSlots,
            this.grid.edgeStore.pool,
            this.grid.edgeStore.passageEdgeCount,
            arena.vertexPassability,
        );
        const topology = navTopologyFromArena(arena);
        topology.octilePredecessors = arena.octilePredecessors;
        bakeNavTopologyIntoArena(simView, topology, arena.cardinalOpen, arena.vertexPassability, idx);
        this._frame = frame;
        this._topology = topology;
        this._source = "local";
        if (!this._worker) this.grid._navTopologyRef = this;
        return this;
    }
    /** @param {WorldObstacleGrid} grid @param {number | null} [idx] */
    static bakeLocal(grid, idx = null) {
        return new NavTopology(grid).bakeInProcess(idx);
    }
    /** @param {WorldObstacleGrid} grid @param {HpaPathWorker} worker */
    static bindWorker(grid, worker) {
        return new NavTopology(grid, { worker });
    }
    /** @param {WorldObstacleGrid} grid @param {number | null} [idx] */
    static packSnapshot(grid, idx = null) {
        const arena = ensureLocalBakeArena(grid);
        packNavTopologyFromGrid(grid, arena, idx);
        return {
            gridFill: arena.gridFill,
            floorKind: arena.floorKind,
            floorFacing: arena.floorFacing,
            edgeSlots: arena.edgeSlots,
            edgePool: grid.edgeStore.pool,
            passageEdgeCount: grid.edgeStore.passageEdgeCount,
        };
    }
    _localArena() {
        return localBakeArenas.get(this.grid) ?? null;
    }
}
/** @param {WorldObstacleGrid} grid */
function ensureLocalBakeArena(grid) {
    const cellCount = grid.cols * grid.rows;
    const vertCount = (grid.cols + 1) * (grid.rows + 1);
    let arena = localBakeArenas.get(grid);
    if (!arena || arena.cellCount !== cellCount) {
        arena = createNavTopologySabArena(cellCount, vertCount, grid.cols, grid.rows);
        localBakeArenas.set(grid, arena);
    }
    return arena;
}
/** @param {WorldObstacleGrid} grid */
export function invalidateGridLocalNavBake(grid) {
    localBakeArenas.delete(grid);
    if (grid._navTopologyRef?.invalidateLocalBake) grid._navTopologyRef.invalidateLocalBake();
}
/** @param {NavTopology} navTopology */
export function navTopologyGraphCanStep(navTopology, fromIdx, toIdx) {
    const cardinalOpen = navTopology.navCardinalOpen;
    const vertexPassability = navTopology.vertexPassability;
    if (cardinalOpen && vertexPassability) return !boundaryBlocksStepFrom(navTopology.grid, cardinalOpen, vertexPassability, fromIdx, toIdx);
    const frame = navTopology.frame;
    const topology = navTopology.topology;
    if (frame && topology) return navCanStep(frame, topology, fromIdx, toIdx);
    return false;
}
