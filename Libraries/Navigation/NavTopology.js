import { cellBoundsForGrid, padCellIdxToGrid, forEachDenseCellInBounds } from "../DataStructures/CellRect.js";
import { gridFrameFromGrid } from "../Pathfinding/GridNavSnapshot.js";
import { createNavSimView } from "../Pathfinding/navSimView.js";
import {
    createNavTopologySabArena,
    navTopologyFromArena,
    packNavTopologyFromGrid,
    buildOctileNeighborsFromTopologyBounds,
    buildOctilePredecessorsFromForwardGrid,
    recomputeBlockedFromGridFill,
} from "../Pathfinding/navTopologySab.js";
import { navCanStep } from "../Pathfinding/navTopologySab.js";
import { boundaryBlocksStepFrom, recomputeNavCardinalOpenInto, recomputeVertexPassabilityInto } from "../Spatial/grid/boundaryOccupancy.js";
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
        this._worker = worker;
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
    /** Octile CSR step — movement, HPA, flow. */
    canStep(fromIdx, toIdx) {
        if (!this.isReady()) return false;
        const frame = this.frame;
        const topology = this.topology;
        if (frame && topology) return navCanStep(frame, topology, fromIdx, toIdx);
        const cardinalOpen = this.navCardinalOpen;
        const vertexPassability = this.vertexPassability;
        if (cardinalOpen && vertexPassability) return !boundaryBlocksStepFrom(this.grid, cardinalOpen, vertexPassability, fromIdx, toIdx);
        return false;
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
        const simView = createNavSimView(frame, arena.gridFill, arena.floorKind, arena.floorFacing, arena.edgeSlots, this.grid.edgeStore.pool, arena.vertexPassability);
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
        return { gridFill: arena.gridFill, floorKind: arena.floorKind, floorFacing: arena.floorFacing, edgeSlots: arena.edgeSlots, edgePool: grid.edgeStore.pool };
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
/**
 * One bake pass: blocked → vertex → cardinal → octile → predecessors.
 * Shared by the HPA worker and in-process authoring/tests.
 *
 * @param {ReturnType<typeof createNavSimView>} simView
 * @param {import("../Pathfinding/navTopologySab.js").NavTopology & { octilePredecessors?: Int32Array }} topology
 * @param {Uint8Array} cardinalOpen
 * @param {Uint8Array} vertexPassability
 * @param {number | object | null} idx
 */
export function bakeNavTopologyIntoArena(simView, topology, cardinalOpen, vertexPassability, idx = null) {
    const frame = simView.frame;
    const { cols, rows } = frame;
    const isBounds = idx !== null && typeof idx === "object";
    const bakeBounds = idx !== null ? (isBounds ? idx : padCellIdxToGrid(idx, cols, rows, 1)) : null;
    if (isBounds)
        forEachDenseCellInBounds(idx, cols, (col, row, cellIdx) => {
            recomputeBlockedFromGridFill(simView.grid, topology.blocked, cols, cellIdx);
        });
    else recomputeBlockedFromGridFill(simView.grid, topology.blocked, cols, idx);
    recomputeVertexPassabilityInto(simView, vertexPassability, bakeBounds);
    recomputeNavCardinalOpenInto(simView, cardinalOpen, vertexPassability, bakeBounds);
    buildOctileNeighborsFromTopologyBounds(topology.blocked, cardinalOpen, vertexPassability, cols, rows, topology.octileNeighbors, bakeBounds ?? cellBoundsForGrid(cols, rows));
    if (topology.octilePredecessors) buildOctilePredecessorsFromForwardGrid(topology.octileNeighbors, topology.octilePredecessors, cols, rows, bakeBounds);
}
/**
 * Bake nav topology in-process from the live grid (cell + edge snapshot).
 *
 * @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid
 * @param {import("../DataStructures/CellRect.js").CellBounds | null} [damageBounds]
 */
export function bakeNavTopologyLocal(grid, damageBounds = null) {
    const navTopology = NavTopology.bakeLocal(grid, damageBounds);
    return { frame: navTopology.frame, topology: navTopology.topology, simView: null, cardinalOpen: navTopology.navCardinalOpen, vertexPassability: navTopology.vertexPassability, navTopology };
}
/**
 * Capture the worker bake input snapshot from a live grid.
 *
 * @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid
 * @param {import("../DataStructures/CellRect.js").CellBounds | null} [bounds]
 */
export function captureNavGridSnapshot(grid, bounds = null) {
    return NavTopology.packSnapshot(grid, bounds);
}
