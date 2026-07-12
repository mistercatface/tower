import { edgeMirrorSide, edgeNeighborIdx, bumpGridNavEpoch, bumpFloorOccupancyStampDrawRevision, emptyCellBounds, growCellBoundsIdx, isEmptyCellBounds, gridCellLayout, formatGlobalCellIdx, RailWallBatch, collapsePathRevisits, collectCorridorPathPointIndices, addCorridorPathToOccupied, forEachCardinalNeighborIdx, forEachGlobalCellInMapGenBounds, manhattanDistanceIdx, floorOccupancyStampDrawCacheKey } from "./spatial.js";
import { CorridorPathfinder, createNavGraphView } from "../Navigation/navigation.js";
import { createSeededRng } from "../Math/math.js";
import { BELT_FILMSTRIP_FRAMES, BELT_FRAME_MS, warmSharedGridStampFilmstripCache, drawCachedGridStampFilmstripShared, getCanvasLineScale } from "../Canvas/canvas.js";
import { GRID_NAV_EPOCH_FLOOR, GRID_STAMP_RENDER_KEY_FLOOR_BELT } from "../../Core/engineEnums.js";
import { circleInViewBounds, VIEW_TIER_PROPS } from "../../Core/engineMemory.js";
export const DEFAULT_FLOOR_BELT_FORCE = 500;
const BELT_DIR_X = Int8Array.from([0, 1, 0, -1]);
const BELT_DIR_Y = Int8Array.from([-1, 0, 1, 0]);
const BELT_TWO_PI = Math.PI * 2;
const BELT_LINK_OK = 0;
const BELT_LINK_EXIT_MISMATCH = 1;
const BELT_LINK_ENTRY_MISMATCH = 2;
const BELT_LINK_CANSTEP_BLOCKED = 3;
const BELT_LINK_REVERSE_OPEN = 4;
const BELT_TURN_TABLE = new Uint8Array(16);
const BELT_VALID_TABLE = new Uint8Array(16);
const BELT_FLOW_ANGLE_TABLE = new Float32Array(16);
const BELT_PIVOT_DX_TABLE = new Int8Array(16);
const BELT_PIVOT_DY_TABLE = new Int8Array(16);
const BELT_RAIL_SIDE0_TABLE = new Int8Array(16);
const BELT_RAIL_SIDE1_TABLE = new Int8Array(16);
const BELT_RENDER_KEY_TABLE = new Array(16);
const BELT_LABEL_TABLE = new Array(16);
function beltPack(entrySide, exitSide) {
    return entrySide | (exitSide << 2);
}
const BELT_SPAWN_DEFAULT = { floor_belt: beltPack(3, 1), floor_belt_elbow_left: beltPack(2, 1), floor_belt_elbow_right: beltPack(0, 1) };
for (let exit = 0; exit < 4; exit++)
    for (let di = 0; di < 3; di++) {
        const delta = di === 0 ? 1 : di === 1 ? 2 : 3;
        const entry = (exit + delta) % 4;
        const packed = entry | (exit << 2);
        BELT_VALID_TABLE[packed] = 1;
        BELT_TURN_TABLE[packed] = di;
        const facingIndex = (exit + 3) % 4;
        BELT_FLOW_ANGLE_TABLE[packed] = facingIndex * (BELT_TWO_PI / 4);
        BELT_PIVOT_DX_TABLE[packed] = BELT_DIR_X[entry] + BELT_DIR_X[exit];
        BELT_PIVOT_DY_TABLE[packed] = BELT_DIR_Y[entry] + BELT_DIR_Y[exit];
        if (di === 0) BELT_RENDER_KEY_TABLE[packed] = "floor_belt_elbow_left";
        else if (di === 1) BELT_RENDER_KEY_TABLE[packed] = "floor_belt";
        else BELT_RENDER_KEY_TABLE[packed] = "floor_belt_elbow_right";
        const exitLabel = ["N", "E", "S", "W"][exit];
        BELT_LABEL_TABLE[packed] = di === 1 ? `Conveyor ${exitLabel}` : di === 0 ? `Conveyor Elbow L ${exitLabel}` : `Conveyor Elbow R ${exitLabel}`;
        let railWrite = 0;
        for (let side = 0; side < 4; side++) {
            if (side === entry || side === exit) continue;
            if (railWrite === 0) BELT_RAIL_SIDE0_TABLE[packed] = side;
            else BELT_RAIL_SIDE1_TABLE[packed] = side;
            railWrite++;
        }
    }
function beltLinkCode(idxA, packedA, idxB, packedB, cols, graph) {
    const exitSide = BeltPacked.exit(packedA);
    const entrySide = BeltPacked.entry(packedB);
    const stepSide = BeltPacked.stepSideBetween(idxA, idxB, cols);
    if (stepSide !== exitSide) return BELT_LINK_EXIT_MISMATCH;
    if (edgeMirrorSide(stepSide) !== entrySide) return BELT_LINK_ENTRY_MISMATCH;
    if (!graph.canStepIdx(idxA, idxB)) return BELT_LINK_CANSTEP_BLOCKED;
    if (graph.canStepIdx(idxB, idxA)) return BELT_LINK_REVERSE_OPEN;
    return BELT_LINK_OK;
}
function beltLinkReason(code, idxA, packedA, idxB, packedB, cols) {
    if (code === BELT_LINK_EXIT_MISMATCH) return `exit ${BeltPacked.exit(packedA)} ≠ step ${BeltPacked.stepSideBetween(idxA, idxB, cols)}`;
    if (code === BELT_LINK_ENTRY_MISMATCH) return `entry ${BeltPacked.entry(packedB)} ≠ approach ${edgeMirrorSide(BeltPacked.stepSideBetween(idxA, idxB, cols))}`;
    if (code === BELT_LINK_CANSTEP_BLOCKED) return "canStep blocked";
    if (code === BELT_LINK_REVERSE_OPEN) return "reverse canStep open";
    return "";
}
export class BeltPacked {
    static EMPTY = 0;
    static pack(entrySide, exitSide) {
        return entrySide | (exitSide << 2);
    }
    static entry(packed) {
        return packed & 3;
    }
    static exit(packed) {
        return (packed >> 2) & 3;
    }
    static rotate(packed, steps) {
        const s = ((steps % 4) + 4) % 4;
        return ((BeltPacked.entry(packed) + s) & 3) | (((BeltPacked.exit(packed) + s) & 3) << 2);
    }
    static isValid(packed) {
        return packed !== 0 && BELT_VALID_TABLE[packed] !== 0;
    }
    static fromSides(entrySide, exitSide) {
        return BeltPacked.pack(entrySide, exitSide);
    }
    static withTurn(packed, turn) {
        const exit = BeltPacked.exit(packed);
        const delta = turn === 0 ? 2 : turn === 1 ? 1 : 3;
        return BeltPacked.pack((exit + delta) % 4, exit);
    }
    static turn(packed) {
        return BELT_TURN_TABLE[packed];
    }
    static flowAngle(packed) {
        return BELT_FLOW_ANGLE_TABLE[packed];
    }
    static pivotDx(packed) {
        return BELT_PIVOT_DX_TABLE[packed];
    }
    static pivotDy(packed) {
        return BELT_PIVOT_DY_TABLE[packed];
    }
    static renderKey(packed) {
        return BELT_RENDER_KEY_TABLE[packed];
    }
    static label(packed) {
        return BELT_LABEL_TABLE[packed];
    }
    static stripKey(packed) {
        return packed;
    }
    static railSide0(packed) {
        return BELT_RAIL_SIDE0_TABLE[packed];
    }
    static railSide1(packed) {
        return BELT_RAIL_SIDE1_TABLE[packed];
    }
    static defaultForSpawn(assetId) {
        return BELT_SPAWN_DEFAULT[assetId] ?? BELT_SPAWN_DEFAULT.floor_belt;
    }
    static stepSideBetween(fromIdx, toIdx, cols) {
        const diff = toIdx - fromIdx;
        if (diff === 1 && (fromIdx + 1) % cols !== 0) return 1;
        if (diff === -1 && fromIdx % cols !== 0) return 3;
        if (diff === cols) return 2;
        if (diff === -cols) return 0;
        return -1;
    }
    static blocksStep(grid, fromIdx, toIdx) {
        const cols = grid.cols;
        const stepSide = BeltPacked.stepSideBetween(fromIdx, toIdx, cols);
        const fromPacked = grid.floorPacked[fromIdx];
        const toPacked = grid.floorPacked[toIdx];
        if (!fromPacked && !toPacked) return false;
        if (stepSide < 0) return true;
        if (fromPacked && stepSide !== BeltPacked.exit(fromPacked)) return true;
        if (toPacked && edgeMirrorSide(stepSide) === BeltPacked.exit(toPacked)) return true;
        return false;
    }
    static linkOk(idxA, packedA, idxB, packedB, cols, graph) {
        const code = beltLinkCode(idxA, packedA, idxB, packedB, cols, graph);
        if (code === BELT_LINK_OK) return { ok: true };
        return { ok: false, reason: beltLinkReason(code, idxA, packedA, idxB, packedB, cols) };
    }
    static orientationOptions() {
        return BELT_ORIENTATION_OPTIONS;
    }
}
const BELT_ORIENTATION_OPTIONS = Object.freeze(
    (() => {
        const out = [];
        for (let packed = 1; packed < 16; packed++) if (BeltPacked.isValid(packed)) out.push(Object.freeze({ packed, label: BeltPacked.label(packed) }));
        return out;
    })(),
);
function beltIdxInBounds(grid, idx) {
    return idx >= 0 && idx < grid.cols * grid.rows;
}
export class FloorBelt {
    static getEntryEdgeWorldPoint(buf, o, grid, idx, entrySide) {
        const inset = grid.cellSize * 0.35;
        buf[o] = grid.gridCenterXByIdx(idx) + BELT_DIR_X[entrySide] * inset;
        buf[o + 1] = grid.gridCenterYByIdx(idx) + BELT_DIR_Y[entrySide] * inset;
    }
    static entryNeighborIdx(grid, idx) {
        const packed = grid.floorPacked[idx];
        if (!BeltPacked.isValid(packed)) return -1;
        return edgeNeighborIdx(idx, BeltPacked.entry(packed), grid);
    }
    static entryEdgeWorldPoint(buf, o, grid, idx) {
        const packed = grid.floorPacked[idx];
        if (!BeltPacked.isValid(packed)) return false;
        FloorBelt.getEntryEdgeWorldPoint(buf, o, grid, idx, BeltPacked.entry(packed));
        return true;
    }
    static isBeltAtIdx(grid, idx) {
        if (!beltIdxInBounds(grid, idx)) return false;
        return BeltPacked.isValid(grid.floorPacked[idx]);
    }
    static isEntityOnBelt(grid, x, y) {
        return FloorBelt.isBeltAtIdx(grid, grid.worldToIdx(x, y));
    }
    static pickRotatableOccupantAtWorld(state, worldX, worldY) {
        const grid = state.obstacleGrid;
        const idx = grid.worldToIdx(worldX, worldY);
        if (idx < 0) return -1;
        if (grid.floorPacked[idx] !== 0) return idx;
        return -1;
    }
    static rotateOccupantAt(state, occupant, steps = 1, onCommit) {
        const grid = state.obstacleGrid;
        const idx = occupant;
        const packed = grid.floorPacked[idx];
        if (!packed) return false;
        grid.writeFloorCell(idx, BeltPacked.rotate(packed, steps));
        onCommit(state, idx);
        return true;
    }
    static canStampAt(state, idx) {
        const grid = state.obstacleGrid;
        if (!beltIdxInBounds(grid, idx)) return false;
        if (grid.isBlockedIdx(idx)) return false;
        if (grid.hasFloorOccupancy(idx)) return false;
        return true;
    }
    static clearOverlayAt(state, idx) {
        const grid = state.obstacleGrid;
        if (!beltIdxInBounds(grid, idx)) return false;
        if (!grid.clearFloorCell(idx)) return false;
        return true;
    }
    static listPlacedForSnapshot(grid) {
        const items = [];
        const size = grid.cols * grid.rows;
        for (let idx = 0; idx < size; idx++) {
            const packed = grid.floorPacked[idx];
            if (!packed) continue;
            const item = { idx, packed };
            items.push(item);
        }
        return items;
    }
    static applyFromSnapshot(state, doc) {
        const grid = state.obstacleGrid;
        const half = grid.cellHalfSize;
        const bounds = emptyCellBounds();
        const cellSize = doc.cellSize ?? grid.cellSize;
        let floorNavChanged = false;
        for (let i = 0; i < doc.floorBelts.length; i++) {
            const { idx: docIdx, packed } = doc.floorBelts[i];
            if (!BeltPacked.isValid(packed)) throw new Error(`Invalid floor belt packed: ${packed}`);
            const idx = grid.worldToIdx(doc.origin.minX + (docIdx % doc.cols) * cellSize + half, doc.origin.minY + Math.floor(docIdx / doc.cols) * cellSize + half);
            if (!beltIdxInBounds(grid, idx)) continue;
            if (grid.floorPacked[idx] !== packed) floorNavChanged = true;
            grid.writeFloorCell(idx, packed);
            growCellBoundsIdx(bounds, idx, grid);
        }
        if (floorNavChanged) bumpGridNavEpoch(grid, GRID_NAV_EPOCH_FLOOR);
        if (isEmptyCellBounds(bounds)) return null;
        bumpFloorOccupancyStampDrawRevision(grid);
        let beltCount = 0;
        const beltSize = grid.cols * grid.rows;
        for (let beltIdx = 0; beltIdx < beltSize; beltIdx++) if (grid.floorPacked[beltIdx] !== 0) beltCount++;
        grid.floorBeltCount = beltCount;
        return bounds;
    }
    static syncAnimFromBodies(state, spatialFrame, dt) {
        const grid = state.obstacleGrid;
        if (grid.floorBeltCount === 0) return;
        let list = grid._floorBeltLoadedIdx;
        const load = grid._floorBeltLoad;
        const prevCount = grid._floorBeltLoadedCount;
        for (let i = 0; i < prevCount; i++) load[list[i]] = 0;
        let write = 0;
        const kineticBodies = spatialFrame._kineticBodies;
        if (kineticBodies?.length)
            for (let i = 0; i < kineticBodies.length; i++) {
                const entity = kineticBodies[i];
                const idx = grid.worldToIdx(entity.x, entity.y);
                if (idx < 0 || !grid.floorPacked[idx]) continue;
                if (load[idx] === 0) {
                    if (write >= list.length) {
                        const grown = new Uint32Array(Math.max(8, list.length * 2));
                        grown.set(list.subarray(0, write));
                        list = grid._floorBeltLoadedIdx = grown;
                    }
                    list[write++] = idx;
                }
                load[idx]++;
            }
        grid._floorBeltLoadedCount = write;
        for (let i = 0; i < write; i++) grid._floorBeltAnimMs[list[i]] += dt;
    }
}
function classifyBeltCell(cells, footprint, idx, layout) {
    const packed = cells.get(idx);
    const entrySide = BeltPacked.entry(packed);
    const exitSide = BeltPacked.exit(packed);
    const entryIdx = edgeNeighborIdx(idx, entrySide, layout);
    const exitIdx = edgeNeighborIdx(idx, exitSide, layout);
    return { idx, packed, entrySide, exitSide, entryIdx, exitIdx, entryInFootprint: footprint.has(entryIdx), exitInFootprint: footprint.has(exitIdx) };
}
function beltPlanCellError(classification, cells, footprint, mouthExteriorIndices) {
    const { idx, packed, entrySide, exitSide, entryIdx, exitIdx, entryInFootprint, exitInFootprint } = classification;
    if (!packed) return `belt plan: missing belt at ${formatGlobalCellIdx(idx)}`;
    if (entryInFootprint) {
        const entryExit = BeltPacked.exit(cells.get(entryIdx));
        if (entryExit !== edgeMirrorSide(entrySide)) return `belt plan: belt chain break ${formatGlobalCellIdx(entryIdx)} -> ${formatGlobalCellIdx(idx)} (entry side ${entrySide}, upstream exit ${entryExit})`;
    }
    if (exitInFootprint) {
        const exitEntry = BeltPacked.entry(cells.get(exitIdx));
        if (exitEntry !== edgeMirrorSide(exitSide)) return `belt plan: belt chain break ${formatGlobalCellIdx(idx)} -> ${formatGlobalCellIdx(exitIdx)} (exit side ${exitSide}, downstream entry ${exitEntry})`;
    }
    if (!entryInFootprint && !exitInFootprint && !mouthExteriorIndices.has(idx)) return `belt plan: dead-end belt at ${formatGlobalCellIdx(idx)}`;
    return null;
}
export class BeltPlan {
    constructor() {
        this.cells = new Map();
    }
    get size() {
        return this.cells.size;
    }
    get(idx) {
        return this.cells.get(idx);
    }
    set(idx, packed) {
        this.cells.set(idx, packed);
    }
    accumulatePath(path, width, layout) {
        const collapsed = collapsePathRevisits(path, layout);
        const stride = layout.strideCols;
        for (let i = 0; i < collapsed.length; i++) {
            const pIdx = collapsed[i];
            const prevIdx = i > 0 ? collapsed[i - 1] : undefined;
            const nextIdx = i < collapsed.length - 1 ? collapsed[i + 1] : undefined;
            if (prevIdx !== undefined && pIdx === prevIdx) continue;
            const cells = collectCorridorPathPointIndices(pIdx, prevIdx, nextIdx, width, false, i, collapsed.length, layout);
            let packed;
            if (prevIdx !== undefined && nextIdx !== undefined) {
                const entrySide = BeltPacked.stepSideBetween(pIdx, prevIdx, stride);
                const exitSide = BeltPacked.stepSideBetween(pIdx, nextIdx, stride);
                packed = BeltPacked.fromSides(entrySide, exitSide);
            } else if (nextIdx !== undefined) {
                const exitSide = BeltPacked.stepSideBetween(pIdx, nextIdx, stride);
                packed = BeltPacked.fromSides(edgeMirrorSide(exitSide), exitSide);
            } else if (prevIdx !== undefined) {
                const entrySide = BeltPacked.stepSideBetween(pIdx, prevIdx, stride);
                packed = BeltPacked.fromSides(entrySide, edgeMirrorSide(entrySide));
            } else packed = BeltPacked.fromSides(3, 1);
            for (let ci = 0; ci < cells.length; ci++) this.cells.set(cells[ci], packed);
        }
    }
    accumulatePaths(paths, widths, layout) {
        for (let pi = 0; pi < paths.length; pi++) this.accumulatePath(paths[pi], widths[pi], layout);
    }
    validate(layout, mouthExteriorIndices = new Set()) {
        const footprint = new Set(this.cells.keys());
        for (const idx of footprint) {
            const error = beltPlanCellError(classifyBeltCell(this.cells, footprint, idx, layout), this.cells, footprint, mouthExteriorIndices);
            if (error) return { ok: false, error, footprint, cells: this.cells };
        }
        return { ok: true, footprint, cells: this.cells, error: null };
    }
    validatePath(graph, cellIndices) {
        if (cellIndices.length < 2) return { ok: true };
        const { grid } = graph;
        const cols = grid.cols;
        for (let i = 0; i < cellIndices.length - 1; i++) {
            const a = cellIndices[i];
            const b = cellIndices[i + 1];
            const packedA = this.cells.get(a) ?? grid.floorPacked[a];
            const packedB = this.cells.get(b) ?? grid.floorPacked[b];
            const code = beltLinkCode(a, packedA, b, packedB, cols, graph);
            if (code !== BELT_LINK_OK) return { ok: false, reason: `cell ${i}: ${beltLinkReason(code, a, packedA, b, packedB, cols)}` };
        }
        return { ok: true };
    }
    peel(mouthExteriorIndices, layout) {
        for (let pass = 0; pass < this.cells.size + 4; pass++) {
            const validation = this.validate(layout, mouthExteriorIndices);
            if (validation.ok) return validation;
            const footprint = validation.footprint;
            const removeIndices = new Set();
            for (const idx of footprint) if (beltPlanCellError(classifyBeltCell(this.cells, footprint, idx, layout), this.cells, footprint, mouthExteriorIndices)) removeIndices.add(idx);
            if (removeIndices.size === 0) return validation;
            for (const idx of removeIndices) this.cells.delete(idx);
            if (this.cells.size === 0) return this.validate(layout, mouthExteriorIndices);
        }
        return this.validate(layout, mouthExteriorIndices);
    }
    stamp(state) {
        const grid = state.obstacleGrid;
        let bounds = null;
        for (const [idx, packed] of this.cells) {
            if (!grid.writeFloorCell(idx, packed)) continue;
            if (!bounds) bounds = emptyCellBounds();
            growCellBoundsIdx(bounds, idx, grid);
        }
        return { bounds };
    }
    toRailWalls(heightLevel, thicknessLevel) {
        const batch = new RailWallBatch(Math.max(1, this.cells.size * 2));
        for (const [idx, packed] of this.cells) {
            batch.add(idx, BeltPacked.railSide0(packed), heightLevel, thicknessLevel);
            batch.add(idx, BeltPacked.railSide1(packed), heightLevel, thicknessLevel);
        }
        return batch;
    }
    [Symbol.iterator]() {
        return this.cells[Symbol.iterator]();
    }
}
const RAIL_MAZE_FULL_FOOTPRINT = { interiorOnly: false };
const DEFAULT_CORRIDOR_COUNT = 150;
const DEFAULT_PATH_LENGTH_MIN = 6;
const DEFAULT_PATH_LENGTH_MAX = 24;
const MAX_PAIR_ATTEMPTS_PER_CORRIDOR = 96;
const BELT_PLAN_SEED_SALT = 0xbe1a5afe;
function pathLengthInBand(path, minLen, maxLen) {
    return path.length >= minLen && path.length <= maxLen;
}
function navWalkableNeighborsIdx(grid, navTopology, idx) {
    const out = [];
    forEachCardinalNeighborIdx(idx, grid, (nIdx) => {
        if (grid.canStep(idx, nIdx, navTopology) || grid.canStep(nIdx, idx, navTopology)) out.push(nIdx);
    });
    return out;
}
export function collectRailMazeBeltZoneCells(grid, navTopology, railConfig, navWalkableIndex) {
    const rowOffset = Math.round(grid.minY / grid.cellSize);
    const beltStartRow = ((railConfig.boundsIdx / grid.cols) | 0) + rowOffset;
    const cells = [];
    forEachGlobalCellInMapGenBounds(grid, railConfig, (idx) => {
        const row = (idx / grid.cols) | 0;
        if (row + rowOffset < beltStartRow) return;
        if (idx < 0 || idx >= navWalkableIndex.flags.length || navWalkableIndex.flags[idx] === 0) return;
        cells.push(idx);
    });
    return cells;
}
function degreeInZone(cells, neighborAtIdx) {
    const memberSet = new Set(cells);
    const degreeByIndex = new Map();
    for (let i = 0; i < cells.length; i++) {
        const idx = cells[i];
        const neighbors = neighborAtIdx(idx).filter((nIdx) => memberSet.has(nIdx));
        degreeByIndex.set(idx, neighbors.length);
    }
    return degreeByIndex;
}
function pickRandomFreeIdx(freeIndices, occupiedGlobalIndices, rng) {
    if (freeIndices.length < 2) return -1;
    for (let attempt = 0; attempt < freeIndices.length; attempt++) {
        const idx = freeIndices[Math.floor(rng() * freeIndices.length)];
        if (!occupiedGlobalIndices.has(idx)) return idx;
    }
    return -1;
}
function pickRandomEndInLengthBandIdx(startIdx, endpointIndices, occupiedGlobalIndices, layoutCols, minLen, maxLen, rng) {
    const candidates = [];
    for (let i = 0; i < endpointIndices.length; i++) {
        const idx = endpointIndices[i];
        if (idx === startIdx) continue;
        if (occupiedGlobalIndices.has(idx)) continue;
        const dist = manhattanDistanceIdx(startIdx, idx, layoutCols);
        if (dist < minLen || dist > maxLen) continue;
        candidates.push(idx);
    }
    if (!candidates.length) return pickRandomFreeIdx(endpointIndices, occupiedGlobalIndices, rng);
    return candidates[Math.floor(rng() * candidates.length)];
}
export class CorridorBeltSession {
    constructor(grid, navTopology, railConfig, navWalkableIndex) {
        this.grid = grid;
        this.navTopology = navTopology;
        this.railConfig = railConfig;
        this.layout = gridCellLayout(grid);
        this.pathfinder = new CorridorPathfinder(grid, navTopology, railConfig, navWalkableIndex);
        this.zoneCells = collectRailMazeBeltZoneCells(grid, navTopology, railConfig, navWalkableIndex);
    }
    plan({ corridorCount = DEFAULT_CORRIDOR_COUNT, corridorWidth = 1, pathLengthMin = DEFAULT_PATH_LENGTH_MIN, pathLengthMax = DEFAULT_PATH_LENGTH_MAX, mapSeed = 0, rng = null } = {}) {
        const random = rng ?? createSeededRng((mapSeed ^ BELT_PLAN_SEED_SALT) >>> 0);
        const cols = this.grid.cols;
        const endpointIndices = filterNavBeltEndpointCandidatesIdx(this.grid, this.navTopology, this.zoneCells);
        const occupiedGlobalIndices = new Set();
        const paths = [];
        const widths = [];
        for (let placed = 0; placed < corridorCount; placed++) {
            let placedPath = null;
            for (let attempt = 0; attempt < MAX_PAIR_ATTEMPTS_PER_CORRIDOR; attempt++) {
                const startIdx = pickRandomFreeIdx(endpointIndices, occupiedGlobalIndices, random);
                if (startIdx === -1) break;
                const endIdx = pickRandomEndInLengthBandIdx(startIdx, endpointIndices, occupiedGlobalIndices, cols, pathLengthMin, pathLengthMax, random);
                if (endIdx === -1) break;
                if (startIdx === endIdx) continue;
                const path = this.pathfinder.findCorridorPath(startIdx, endIdx, occupiedGlobalIndices, corridorWidth, pathLengthMax);
                if (!path) continue;
                if (!pathLengthInBand(path, pathLengthMin, pathLengthMax)) continue;
                if (!validateBeltPathMouthAccess(this.grid, this.navTopology, path, occupiedGlobalIndices)) continue;
                placedPath = path;
                break;
            }
            if (!placedPath) break;
            paths.push(placedPath);
            widths.push(corridorWidth);
            addCorridorPathToOccupied(placedPath, occupiedGlobalIndices, corridorWidth, this.layout, RAIL_MAZE_FULL_FOOTPRINT);
        }
        const beltPlan = new BeltPlan();
        beltPlan.accumulatePaths(paths, widths, this.layout);
        const mouthExteriorIndices = new Set(collectPathMouthExteriorIndices(paths, this.grid));
        const validation = beltPlan.peel(mouthExteriorIndices, this.layout);
        const heightLevel = this.railConfig.wallHeightLevel ?? 1;
        const thicknessLevel = this.railConfig.edgeThickness ?? 1;
        const beltRails = beltPlan.toRailWalls(heightLevel, thicknessLevel);
        const neighborAtIdx = (idx) => navWalkableNeighborsIdx(this.grid, this.navTopology, idx);
        const degreeByIndex = degreeInZone(this.zoneCells, neighborAtIdx);
        return { beltPlan, paths, beltRails, validation, degreeByIndex, mouthExteriorIndices, pathCount: paths.length, zoneCellCount: this.zoneCells.length };
    }
}
export function hasOpenBeltMouthSideIdx(grid, navTopology, idx) {
    if (grid.isBlockedIdx(idx)) return false;
    const navGraph = createNavGraphView(navTopology.grid, { cardinalOpen: navTopology.navCardinalOpen, vertexPassability: navTopology.vertexPassability }, navTopology);
    let open = false;
    forEachCardinalNeighborIdx(idx, grid, (nIdx) => {
        if (open) return;
        if (!grid.isBlockedIdx(nIdx) && navGraph.canStepIdx(nIdx, idx) && navGraph.canStepIdx(idx, nIdx)) open = true;
    });
    return open;
}
export function filterNavBeltEndpointCandidatesIdx(grid, navTopology, cellIndices) {
    const out = [];
    for (let i = 0; i < cellIndices.length; i++) {
        const idx = cellIndices[i];
        if (hasOpenBeltMouthSideIdx(grid, navTopology, idx)) out.push(idx);
    }
    return out;
}
export function beltPathMouthExteriorCells(path, grid) {
    const cols = grid.cols;
    const startIdx = path[0];
    const secondIdx = path[1];
    const endIdx = path[path.length - 1];
    const prevIdx = path[path.length - 2];
    const startEntrySide = BeltPacked.stepSideBetween(secondIdx, startIdx, cols);
    const entryExteriorIdx = edgeNeighborIdx(startIdx, startEntrySide, grid);
    const endExitSide = BeltPacked.stepSideBetween(prevIdx, endIdx, cols);
    const exitExteriorIdx = edgeNeighborIdx(endIdx, endExitSide, grid);
    return { entryExteriorIdx, exitExteriorIdx };
}
export function validateBeltPathMouthAccess(grid, navTopology, path, occupiedGlobalIndices = new Set()) {
    if (path.length < 2) return false;
    const startIdx = path[0];
    const endIdx = path[path.length - 1];
    const { entryExteriorIdx, exitExteriorIdx } = beltPathMouthExteriorCells(path, grid);
    if (entryExteriorIdx === -1 || exitExteriorIdx === -1) return false;
    if (grid.isBlockedIdx(entryExteriorIdx)) return false;
    if (grid.isBlockedIdx(exitExteriorIdx)) return false;
    if (occupiedGlobalIndices.has(entryExteriorIdx)) return false;
    if (occupiedGlobalIndices.has(exitExteriorIdx)) return false;
    const navGraph = createNavGraphView(navTopology.grid, { cardinalOpen: navTopology.navCardinalOpen, vertexPassability: navTopology.vertexPassability }, navTopology);
    if (!navGraph.canStepIdx(entryExteriorIdx, startIdx)) return false;
    if (!navGraph.canStepIdx(endIdx, exitExteriorIdx)) return false;
    return true;
}
export function collectPathMouthExteriorIndices(paths, grid) {
    const mouths = new Set();
    for (let i = 0; i < paths.length; i++) {
        const path = paths[i];
        if (path.length < 2) continue;
        const startIdx = path[0];
        const endIdx = path[path.length - 1];
        mouths.add(startIdx);
        mouths.add(endIdx);
        const { entryExteriorIdx, exitExteriorIdx } = beltPathMouthExteriorCells(path, grid);
        if (entryExteriorIdx !== -1) mouths.add(entryExteriorIdx);
        if (exitExteriorIdx !== -1) mouths.add(exitExteriorIdx);
    }
    return mouths;
}
function createFlatConveyorDraw(turn) {
    const chevronFill = "#0EA5E9";
    const chevronStroke = "#0284C7";
    const beltStroke = "#111111";
    const beltFill = "#1e1e1e";
    return (ctx, hx, hy, facing, ageMs) => {
        const lineScale = getCanvasLineScale(ctx);
        ctx.save();
        ctx.rotate(facing);
        ctx.fillStyle = beltFill;
        ctx.fillRect(-hx, -hy, hx * 2, hy * 2);
        ctx.strokeStyle = beltStroke;
        ctx.lineWidth = 1.0 * lineScale;
        ctx.strokeRect(-hx, -hy, hx * 2, hy * 2);
        ctx.beginPath();
        ctx.rect(-hx, -hy, hx * 2, hy * 2);
        ctx.clip();
        const speed = 20;
        const spacing = 8;
        const timeSec = ageMs / 1000;
        const strokeSlats = (drawSlat) => {
            ctx.strokeStyle = "rgba(10, 10, 10, 0.4)";
            ctx.lineWidth = 1.0 * lineScale;
            drawSlat();
        };
        const styleChevrons = () => {
            ctx.fillStyle = chevronFill;
            ctx.strokeStyle = chevronStroke;
            ctx.lineWidth = 0.5 * lineScale;
        };
        if (turn === 1) {
            const offset = (timeSec * speed) % spacing;
            strokeSlats(() => {
                const numSlats = Math.ceil((hx * 2) / 4) + 2;
                for (let i = -2; i < numSlats; i++) {
                    const cx = -hx + ((timeSec * speed) % 4) + i * 4;
                    ctx.beginPath();
                    ctx.moveTo(cx, -hy);
                    ctx.lineTo(cx, hy);
                    ctx.stroke();
                }
            });
            styleChevrons();
            const numChevrons = Math.ceil((hx * 2) / spacing) + 2;
            for (let i = -2; i < numChevrons; i++) {
                const cx = -hx + offset + i * spacing;
                ctx.beginPath();
                ctx.moveTo(cx + 1.5, 0);
                ctx.lineTo(cx - 1.2, 3.2);
                ctx.lineTo(cx - 0.4, 3.2);
                ctx.lineTo(cx + 0.8, 0);
                ctx.lineTo(cx - 0.4, -3.2);
                ctx.lineTo(cx - 1.2, -3.2);
                ctx.closePath();
                ctx.fill();
                ctx.stroke();
            }
            ctx.restore();
            return;
        }
        const isLeft = turn === 0;
        const pivotX = hx;
        const pivotY = isLeft ? hy : -hy;
        const startAngle = Math.PI;
        const dir = isLeft ? 1 : -1;
        const arcR = hx;
        const totalArcLength = (Math.PI / 2) * arcR;
        const offset = (timeSec * speed) % spacing;
        strokeSlats(() => {
            const numSlats = Math.ceil(totalArcLength / 4) + 2;
            for (let i = -1; i < numSlats; i++) {
                const s = ((timeSec * speed) % 4) + i * 4;
                if (s < 0 || s > totalArcLength) continue;
                const A = startAngle + dir * (s / arcR);
                ctx.beginPath();
                ctx.moveTo(pivotX, pivotY);
                ctx.lineTo(pivotX + 25 * Math.cos(A), pivotY + 25 * Math.sin(A));
                ctx.stroke();
            }
        });
        styleChevrons();
        const numChevrons = Math.ceil(totalArcLength / spacing) + 2;
        for (let i = -1; i < numChevrons; i++) {
            const s = offset + i * spacing;
            if (s < -2 || s > totalArcLength + 2) continue;
            const A = startAngle + dir * (s / arcR);
            const tipAngle = A + dir * (1.5 / arcR);
            const wingAngle = A - dir * (1.2 / arcR);
            const innerAngle = A - dir * (0.4 / arcR);
            const innerTipAngle = A + dir * (0.8 / arcR);
            ctx.beginPath();
            ctx.moveTo(pivotX + 8 * Math.cos(tipAngle), pivotY + 8 * Math.sin(tipAngle));
            ctx.lineTo(pivotX + (8 - 3.2) * Math.cos(wingAngle), pivotY + (8 - 3.2) * Math.sin(wingAngle));
            ctx.lineTo(pivotX + (8 - 3.2) * Math.cos(innerAngle), pivotY + (8 - 3.2) * Math.sin(innerAngle));
            ctx.lineTo(pivotX + 8 * Math.cos(innerTipAngle), pivotY + 8 * Math.sin(innerTipAngle));
            ctx.lineTo(pivotX + (8 + 3.2) * Math.cos(innerAngle), pivotY + (8 + 3.2) * Math.sin(innerAngle));
            ctx.lineTo(pivotX + (8 + 3.2) * Math.cos(wingAngle), pivotY + (8 + 3.2) * Math.sin(wingAngle));
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
        }
        ctx.restore();
    };
}
const BELT_FILMSTRIP_DRAW_BY_TURN = [createFlatConveyorDraw(0), createFlatConveyorDraw(1), createFlatConveyorDraw(2)];
const BELT_FILMSTRIP_DRAW = new Array(16);
let beltFilmstripDrawReady = false;
function ensureBeltFilmstripDrawTable() {
    if (beltFilmstripDrawReady) return;
    for (let packed = 1; packed < 16; packed++) {
        if (!BeltPacked.isValid(packed)) continue;
        BELT_FILMSTRIP_DRAW[packed] = BELT_FILMSTRIP_DRAW_BY_TURN[BeltPacked.turn(packed)];
    }
    beltFilmstripDrawReady = true;
}
function beltDrawForPacked(packed) {
    ensureBeltFilmstripDrawTable();
    return BELT_FILMSTRIP_DRAW[packed];
}
export class FloorBeltDrawCache {
    constructor() {
        this.revision = -1;
        this.idx = new Uint32Array(0);
        this.count = 0;
        this.uniquePacked = new Uint8Array(12);
        this.uniqueCount = 0;
        this.cellHalf = 0;
    }
    static clear(state) {
        if (!state.sandbox) return;
        state.sandbox.floorBeltDrawCache = null;
    }
    sync(state, grid, viewport = null) {
        if (!state.sandbox) return null;
        if (!state.sandbox.floorBeltDrawCache) state.sandbox.floorBeltDrawCache = new FloorBeltDrawCache();
        const cache = state.sandbox.floorBeltDrawCache;
        const revision = floorOccupancyStampDrawCacheKey(grid);
        if (cache.revision === revision) return cache;
        const cellHalf = grid.cellHalfSize;
        cache.cellHalf = cellHalf;
        const size = grid.cols * grid.rows;
        let idxList = cache.idx.length >= grid.floorBeltCount ? cache.idx : new Uint32Array(Math.max(grid.floorBeltCount, 8));
        const packedSeen = new Uint8Array(16);
        let count = 0;
        let uniqueCount = 0;
        const uniquePacked = cache.uniquePacked;
        for (let cellIdx = 0; cellIdx < size; cellIdx++) {
            const packed = grid.floorPacked[cellIdx];
            if (!packed) continue;
            if (count >= idxList.length) {
                const grown = new Uint32Array(idxList.length * 2);
                grown.set(idxList.subarray(0, count));
                idxList = grown;
            }
            idxList[count++] = cellIdx;
            if (!packedSeen[packed]) {
                packedSeen[packed] = 1;
                uniquePacked[uniqueCount++] = packed;
            }
        }
        cache.revision = revision;
        cache.idx = idxList;
        cache.count = count;
        cache.uniqueCount = uniqueCount;
        if (viewport && uniqueCount) warmSharedGridStampFilmstripCache(viewport, cellHalf, GRID_STAMP_RENDER_KEY_FLOOR_BELT, uniquePacked, uniqueCount, BeltPacked.flowAngle, beltDrawForPacked, BELT_FILMSTRIP_FRAMES);
        return cache;
    }
    draw(ctx, viewport, grid) {
        if (!this.count) return;
        const cellHalf = this.cellHalf;
        for (let i = 0; i < this.count; i++) {
            const cellIdx = this.idx[i];
            const x = grid.gridCenterXByIdx(cellIdx);
            const y = grid.gridCenterYByIdx(cellIdx);
            if (!circleInViewBounds(x, y, cellHalf, VIEW_TIER_PROPS)) continue;
            const packed = grid.floorPacked[cellIdx];
            const frameIndex = Math.floor(grid._floorBeltAnimMs[cellIdx] / BELT_FRAME_MS) % BELT_FILMSTRIP_FRAMES;
            drawCachedGridStampFilmstripShared(ctx, x, y, cellHalf, viewport, GRID_STAMP_RENDER_KEY_FLOOR_BELT, BeltPacked.stripKey(packed), BeltPacked.flowAngle(packed), beltDrawForPacked(packed), frameIndex, BELT_FILMSTRIP_FRAMES);
        }
    }
}
export function drawFloorOccupancyBelts(ctx, state, viewport) {
    const grid = state.obstacleGrid;
    if (grid.floorBeltCount === 0) return;
    if (!state.sandbox) return;
    if (!state.sandbox.floorBeltDrawCache) state.sandbox.floorBeltDrawCache = new FloorBeltDrawCache();
    const cache = state.sandbox.floorBeltDrawCache.sync(state, grid, viewport);
    cache.draw(ctx, viewport, grid);
}
