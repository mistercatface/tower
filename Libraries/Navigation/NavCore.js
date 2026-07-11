import { IdxMinHeap } from "../DataStructures/MinHeap.js";
import { PathfindingWorkerClient } from "./PathfindingWorkerClient.js";
import { CARDINAL_DCOL, CARDINAL_DR, OCTILE_DCOL, OCTILE_DR, OCTILE_STEP_COST, OCTILE_DIR_COUNT, circleIntersectsAabb, createAabb, ENGINE_F32, N_OUT_XY, N_OUT_STEER } from "../Math/math.js";
import { manhattanDistanceIdx, octileDistanceIdx, makeAdjacencyKey, boundaryBlocksStepFrom, recomputeNavCardinalOpenInto, recomputeVertexPassabilityInto, isNavTopologyReady, CELL_EDGE_SLOT_BYTES, cellEdgeSlotOffset, cellInRect, diagonalStepOpen, getCardinalBit, edgeNeighborIdx, hasLineOfSight, worldColAtOrigin, worldRowAtOrigin, cellBoundsForGrid, forEachDenseCellInBounds, padCellIdxToGrid, padCellBoundsInPlace, forEachDenseCellInRect, gridNavCacheKey, centeredGridFrameKey, createCenteredGridFrame, getCellBoundsInCenteredFrame, gridCenterXInCenteredFrame, gridCenterYInCenteredFrame, setCenteredGridFrameCenter, worldColInCenteredFrame, worldRowInCenteredFrame, isEmptyCellBounds, unionCellBounds, isIdxInMapGenBounds, stampLayoutFromConfig, forEachStampGlobalIdx, gridCellLayout, corridorPathHitsOccupied } from "../Spatial/spatial.js";
import { FloorBelt } from "../Spatial/belts.js";
import { PortalLink } from "../Spatial/portals.js";
import { MAX_HPA_REPLAN_SLOTS } from "./HpaPathWorker.js";
import { resolveBodyRadius, physicsSettings, getKineticRollConfig, steerRollToward, clearGroundRollDrive, decelerateRoll } from "../Physics/physics.js";
import { FlowFieldGrid } from "./NavFlowField.js";
import { VIEW_TIER } from "../Viewport/ViewBounds.js";
// --- NavMath.js ---
export function buildNavReachableMaskFromSeed(blocked, octileNeighbors, cols, rows, seedIdx, activePortalPairs = null, activePortalCount = null) {
    const size = cols * rows;
    const reachable = new Uint8Array(size);
    if (seedIdx < 0 || seedIdx >= size || blocked[seedIdx] || !octileNeighbors) return reachable;
    const portalCount = activePortalPairCount(activePortalCount);
    bfsIndices([seedIdx], (idx, enqueue) => {
        if (blocked[idx] || reachable[idx]) return;
        reachable[idx] = 1;
        forEachNavWalkNeighbor(idx, blocked, octileNeighbors, activePortalPairs, portalCount, (nIdx) => {
            if (!reachable[nIdx]) enqueue(nIdx);
        });
    });
    return reachable;
}
export function snapNavGoalCellIndex(grid, fromIdx, targetIdx) {
    const portalSnapped = PortalLink.approachGoalIdx(grid, fromIdx, targetIdx);
    if (portalSnapped !== targetIdx) return portalSnapped;
    if (!FloorBelt.isBeltAtIdx(grid, targetIdx)) return targetIdx;
    const neighborIdx = FloorBelt.entryNeighborIdx(grid, targetIdx);
    if (neighborIdx === -1 || grid.grid[neighborIdx] !== 0) return targetIdx;
    if (fromIdx === neighborIdx) return targetIdx;
    return neighborIdx;
}
export function snapNavGoalWorld(buf, o, grid, fromX, fromY, targetX, targetY) {
    const fromIdx = grid.worldToIdx(fromX, fromY);
    const targetIdx = grid.worldToIdx(targetX, targetY);
    if (targetIdx < 0) {
        buf[o] = targetX;
        buf[o + 1] = targetY;
        return;
    }
    if (!cellInRect(targetIdx, grid)) {
        buf[o] = targetX;
        buf[o + 1] = targetY;
        return;
    }
    const snappedIdx = snapNavGoalCellIndex(grid, fromIdx, targetIdx);
    if (snappedIdx !== targetIdx) {
        buf[o] = grid.gridCenterXByIdx(snappedIdx);
        buf[o + 1] = grid.gridCenterYByIdx(snappedIdx);
        return;
    }
    if (!FloorBelt.isBeltAtIdx(grid, targetIdx) || fromIdx === targetIdx) {
        buf[o] = targetX;
        buf[o + 1] = targetY;
        return;
    }
    if (FloorBelt.entryEdgeWorldPoint(buf, o, grid, targetIdx)) return;
    buf[o] = targetX;
    buf[o + 1] = targetY;
}
export function gridNavFrameKey(grid) {
    return `${grid.cols}:${grid.rows}:${grid.minX}:${grid.minY}:${grid.cellSize}`;
}
export function gridFrameFromGrid(grid) {
    return { minX: grid.minX, minY: grid.minY, cellSize: grid.cellSize, cols: grid.cols, rows: grid.rows, key: gridNavFrameKey(grid) };
}
export function snapshotGridCenterX(frame, col) {
    return gridCenterXAtOrigin(col, frame.minX, frame.cellSize * 0.5);
}
export function snapshotGridCenterY(frame, row) {
    return gridCenterYAtOrigin(row, frame.minY, frame.cellSize * 0.5);
}
export function snapshotWorldToIdx(frame, x, y) {
    const col = worldColAtOrigin(x, frame.minX, frame.cellSize);
    const row = worldRowAtOrigin(y, frame.minY, frame.cellSize);
    if (col < 0 || col >= frame.cols || row < 0 || row >= frame.rows) return -1;
    return row * frame.cols + col;
}
export function snapshotGridToWorldIdx(buf, o, frame, idx) {
    buf[o] = snapshotGridCenterX(frame, idx % frame.cols);
    buf[o + 1] = snapshotGridCenterY(frame, (idx / frame.cols) | 0);
}
// --- NavSearch.js ---
export class SearchState {
    constructor(size) {
        this.gScore = new Float32Array(size);
        this.cameFrom = new Int32Array(size);
        this.visited = new Int32Array(size);
        this.runId = 0;
    }
    prepare() {
        this.runId++;
        return this;
    }
    resize(size) {
        if (this.gScore.length !== size) {
            this.gScore = new Float32Array(size);
            this.cameFrom = new Int32Array(size);
            this.visited = new Int32Array(size);
            this.runId = 0;
        }
    }
}
export class FlatGridView {
    constructor(cols, rows, { blocked = null, neighborLayout = null, flowToNavIdx = null, canStep = null } = {}) {
        this.cols = cols;
        this.rows = rows;
        this.cellCount = cols * rows;
        this.blocked = blocked;
        this.neighborLayout = neighborLayout;
        this.flowToNavIdx = flowToNavIdx;
        this._canStep = canStep;
    }
    idx(col, row) {
        return row * this.cols + col;
    }
    containsIdx(idx) {
        return idx >= 0 && idx < this.cellCount;
    }
    canStep(idx0, idx1) {
        if (idx0 < 0 || idx0 >= this.cellCount || idx1 < 0 || idx1 >= this.cellCount) return false;
        const cols = this.cols;
        if (Math.abs((idx0 % cols) - (idx1 % cols)) > 1) return false; // Boundary horizontal wrap check
        if (this._canStep) return this._canStep(idx0, idx1);
        if (this.blocked) return !this.blocked[idx1];
        return true;
    }
}
export class FlatGridSearch {
    constructor(searchState) {
        this.searchState = searchState;
        this._grid = null;
        this.cols = 0;
        this.neighbors = null;
        this._cardinalDidx = null;
        this._octileDidx = null;
        this._lastCols = 0;
    }
    get grid() {
        return this._grid;
    }
    set grid(g) {
        this._grid = g;
        if (g) this.cols = g.cols;
    }
    getOffsets(cardinal, cols) {
        if (this._lastCols !== cols) {
            this._lastCols = cols;
            this._cardinalDidx = new Int32Array(4);
            for (let i = 0; i < 4; i++) this._cardinalDidx[i] = CARDINAL_DCOL[i] + CARDINAL_DR[i] * cols;
            this._octileDidx = new Int32Array(8);
            for (let i = 0; i < 8; i++) this._octileDidx[i] = OCTILE_DCOL[i] + OCTILE_DR[i] * cols;
        }
        return cardinal ? this._cardinalDidx : this._octileDidx;
    }
    cardinal(startIdx, targetIdx, maxPathLen, outPath) {
        return this.runGrid(startIdx, targetIdx, maxPathLen, 4, outPath);
    }
    local(startIdx, targetIdx, maxPathLen, outPath) {
        return this.runGrid(startIdx, targetIdx, maxPathLen, 8, outPath);
    }
    navWalkBfsPath(startIdx, targetIdx, blocked, activePortalPairs, portalCount, outPath) {
        if (startIdx === targetIdx) {
            outPath[0] = startIdx;
            return 1;
        }
        const neighbors = this.neighbors;
        if (!neighbors || !blocked) return 0;
        const { visited, runId, cameFrom } = preparedSearchState(this.searchState);
        const q = [startIdx];
        visited[startIdx] = runId;
        cameFrom[startIdx] = -1;
        for (let qi = 0; qi < q.length; qi++) {
            const idx = q[qi];
            if (idx === targetIdx) return reconstructIndexPathInto(cameFrom, targetIdx, outPath);
            forEachNavWalkNeighbor(idx, blocked, neighbors, activePortalPairs, portalCount, (nIdx) => {
                if (visited[nIdx] === runId) return;
                visited[nIdx] = runId;
                cameFrom[nIdx] = idx;
                q.push(nIdx);
            });
        }
        return 0;
    }
    runGrid(startIdx, targetIdx, maxPathLen, maxDirs, outPath) {
        if (startIdx === targetIdx) {
            outPath[0] = startIdx;
            return 1;
        }
        globalOpenSet.reset();
        const { gScore, cameFrom, visited, runId } = preparedSearchState(this.searchState);
        const cols = this.cols;
        const heuristic = maxDirs === 4 ? manhattanDistanceIdx : octileDistanceIdx;
        gScore[startIdx] = 0;
        visited[startIdx] = runId;
        cameFrom[startIdx] = -1;
        globalOpenSet.push(startIdx, heuristic(startIdx, targetIdx, cols));
        const neighbors = this.neighbors;
        if (neighbors) {
            const edgeCosts = maxDirs === 4 ? CARDINAL_COSTS : OCTILE_COSTS;
            while (globalOpenSet.size > 0) {
                const currIdx = globalOpenSet.pop();
                const currentG = gScore[currIdx];
                if (globalOpenSet.lastPopPriority > currentG + heuristic(currIdx, targetIdx, cols) + STALE_F_EPSILON) continue;
                if (currentG > maxPathLen) continue;
                if (currIdx === targetIdx) return reconstructIndexPathInto(cameFrom, currIdx, outPath);
                const base = currIdx * 8;
                for (let i = 0; i < maxDirs; i++) {
                    const nIdx = neighbors[base + i];
                    if (nIdx === -1) continue;
                    const tentativeG = currentG + edgeCosts[i];
                    if (visited[nIdx] === runId && tentativeG >= gScore[nIdx]) continue;
                    visited[nIdx] = runId;
                    gScore[nIdx] = tentativeG;
                    cameFrom[nIdx] = currIdx;
                    globalOpenSet.push(nIdx, tentativeG + heuristic(nIdx, targetIdx, cols));
                }
            }
        } else {
            const grid = this.grid;
            const offsets = this.getOffsets(maxDirs === 4, cols);
            const edgeCosts = maxDirs === 4 ? CARDINAL_COSTS : OCTILE_COSTS;
            while (globalOpenSet.size > 0) {
                const currIdx = globalOpenSet.pop();
                const currentG = gScore[currIdx];
                if (globalOpenSet.lastPopPriority > currentG + heuristic(currIdx, targetIdx, cols) + STALE_F_EPSILON) continue;
                if (currentG > maxPathLen) continue;
                if (currIdx === targetIdx) return reconstructIndexPathInto(cameFrom, currIdx, outPath);
                for (let i = 0; i < maxDirs; i++) {
                    const nIdx = currIdx + offsets[i];
                    if (!grid.canStep(currIdx, nIdx)) continue;
                    const tentativeG = currentG + edgeCosts[i];
                    if (visited[nIdx] === runId && tentativeG >= gScore[nIdx]) continue;
                    visited[nIdx] = runId;
                    gScore[nIdx] = tentativeG;
                    cameFrom[nIdx] = currIdx;
                    globalOpenSet.push(nIdx, tentativeG + heuristic(nIdx, targetIdx, cols));
                }
            }
        }
        return 0;
    }
    localPortal(startIdx, targetIdx, maxPathLen, outPath, blocked, activePortalPairs, portalCount) {
        if (startIdx === targetIdx) {
            outPath[0] = startIdx;
            return 1;
        }
        globalOpenSet.reset();
        const { gScore, cameFrom, visited, runId } = preparedSearchState(this.searchState);
        const cols = this.cols;
        const neighbors = this.neighbors;
        if (!neighbors || !blocked) return 0;
        const heuristic = (fromIdx) => {
            let minDist = octileDistanceIdx(fromIdx, targetIdx, cols);
            if (activePortalPairs && portalCount > 0)
                for (let i = 0; i < portalCount; i++) {
                    const exitIdx = activePortalPairs[i * 2];
                    const entryIdx = activePortalPairs[i * 2 + 1];
                    const distToExit = octileDistanceIdx(fromIdx, exitIdx, cols);
                    const distFromEntry = octileDistanceIdx(entryIdx, targetIdx, cols);
                    const total = distToExit + distFromEntry;
                    if (total < minDist) minDist = total;
                }
            return minDist;
        };
        gScore[startIdx] = 0;
        visited[startIdx] = runId;
        cameFrom[startIdx] = -1;
        globalOpenSet.push(startIdx, heuristic(startIdx));
        const edgeCosts = OCTILE_COSTS;
        while (globalOpenSet.size > 0) {
            const currIdx = globalOpenSet.pop();
            const currentG = gScore[currIdx];
            if (globalOpenSet.lastPopPriority > currentG + heuristic(currIdx) + STALE_F_EPSILON) continue;
            if (currentG > maxPathLen) continue;
            if (currIdx === targetIdx) return reconstructIndexPathInto(cameFrom, currIdx, outPath);
            // 1. Normal neighbors
            const base = currIdx * 8;
            for (let i = 0; i < 8; i++) {
                const nIdx = neighbors[base + i];
                if (nIdx === -1) continue;
                const tentativeG = currentG + edgeCosts[i];
                if (visited[nIdx] === runId && tentativeG >= gScore[nIdx]) continue;
                visited[nIdx] = runId;
                gScore[nIdx] = tentativeG;
                cameFrom[nIdx] = currIdx;
                globalOpenSet.push(nIdx, tentativeG + heuristic(nIdx));
            }
            // 2. Portals
            if (activePortalPairs && portalCount > 0)
                for (let i = 0; i < portalCount; i++) {
                    const exitIdx = activePortalPairs[i * 2];
                    const entryIdx = activePortalPairs[i * 2 + 1];
                    if (currIdx === exitIdx && !blocked[entryIdx]) {
                        const tentativeG = currentG + 0; // Portal traversal cost is 0
                        if (visited[entryIdx] === runId && tentativeG >= gScore[entryIdx]) continue;
                        visited[entryIdx] = runId;
                        gScore[entryIdx] = tentativeG;
                        cameFrom[entryIdx] = currIdx;
                        globalOpenSet.push(entryIdx, tentativeG + heuristic(entryIdx));
                    }
                }
        }
        return 0;
    }
}
export function computeDistanceTransform(grid, frame, distToWall = null) {
    const { cols, rows } = frame;
    const size = cols * rows;
    const distances = distToWall ?? new Float32Array(size);
    distances.fill(Infinity);
    const queue = [];
    for (let i = 0; i < size; i++)
        if (grid[i]) {
            distances[i] = 0;
            queue.push(i);
        }
    bfsIndices(queue, (currIdx, enqueue) => {
        const currDist = distances[currIdx];
        const col = currIdx % cols;
        const row = (currIdx / cols) | 0;
        for (let i = 0; i < OCTILE_DIR_COUNT; i++) {
            const dc = OCTILE_DCOL[i];
            const dr = OCTILE_DR[i];
            const cost = OCTILE_STEP_COST[i];
            const nc = col + dc;
            const nr = row + dr;
            if (nc >= 0 && nc < cols && nr >= 0 && nr < rows) {
                const nIdx = nr * cols + nc;
                const nextDist = currDist + cost;
                if (nextDist < distances[nIdx]) {
                    distances[nIdx] = nextDist;
                    enqueue(nIdx);
                }
            }
        }
    });
    for (let i = 0; i < size; i++) if (distances[i] === Infinity) distances[i] = 1000;
    return distances;
}
export function createNavLocalView(frame, topology) {
    return { canStepIdx: (fromIdx, toIdx) => navCanStep(frame, topology, fromIdx, toIdx) };
}
export function createNavSimView(frame, gridFill, floorPacked, edgeSlots, edgePool, vertexPassability, activePortalPairs, activePortalCount) {
    const simView = {
        frame,
        grid: gridFill,
        vertexPassability,
        cellEdgeSlots: edgeSlots,
        cellEdgePool: edgePool,
        floorPacked: floorPacked,
        activePortalPairs: activePortalPairs,
        activePortalCount: activePortalCount,
        getCellEdge(idx, side) {
            const ref = edgeSlots[cellEdgeSlotOffset(idx, side)];
            if (ref < 0) return null;
            return simView.cellEdgePool[ref];
        },
        hasAnyCellEdgeAtIdx(idx) {
            const base = idx << 2;
            return edgeSlots[base] !== -1 || edgeSlots[base + 1] !== -1 || edgeSlots[base + 2] !== -1 || edgeSlots[base + 3] !== -1;
        },
        isBlockedIdx(idx) {
            if (idx < 0 || idx >= gridFill.length) return true;
            return gridFill[idx] !== 0;
        },
    };
    Object.defineProperties(simView, {
        cols: {
            get() {
                return frame.cols;
            },
            enumerable: true,
        },
        rows: {
            get() {
                return frame.rows;
            },
            enumerable: true,
        },
        minX: {
            get() {
                return frame.minX;
            },
            enumerable: true,
        },
        minY: {
            get() {
                return frame.minY;
            },
            enumerable: true,
        },
        cellSize: {
            get() {
                return frame.cellSize;
            },
            enumerable: true,
        },
    });
    return simView;
}
export function bindNavSimEdgePool(simView, edgePool) {
    simView.cellEdgePool = edgePool;
}
export function bindNavSimGridFrame(simView, frame) {
    simView.frame = frame;
}
export function createNavGraphView(grid, baked = null, navTopology = null) {
    const topologyRef = navTopology ?? grid._navTopologyRef;
    const frame = topologyRef?.frame ?? null;
    const topology = topologyRef?.topology ?? null;
    return {
        grid,
        frame,
        topology,
        cardinalOpen: baked?.cardinalOpen ?? null,
        vertexPassability: baked?.vertexPassability ?? null,
        isBlockedIdx(idx) {
            return grid.grid[idx] !== 0;
        },
        canStepIdx(fromIdx, toIdx) {
            if (topologyRef) return topologyRef.canStep(fromIdx, toIdx);
            if (this.cardinalOpen && this.vertexPassability) return !boundaryBlocksStepFrom(grid, this.cardinalOpen, this.vertexPassability, fromIdx, toIdx);
            return false;
        },
    };
}
export function createNavGraphViewFromTopology(navTopology) {
    return createNavGraphView(navTopology.grid, { cardinalOpen: navTopology.navCardinalOpen, vertexPassability: navTopology.vertexPassability }, navTopology);
}
export function createNavGraphViewWithLocalBake(grid, damageBounds = null) {
    const baked = bakeNavTopologyLocal(grid, damageBounds);
    return createNavGraphView(grid, { cardinalOpen: baked.cardinalOpen, vertexPassability: baked.vertexPassability }, baked.navTopology);
}
export function bfsIndices(seeds, visit) {
    const queue = Array.isArray(seeds) ? seeds : [seeds];
    let head = 0;
    while (head < queue.length) {
        const idx = queue[head++];
        visit(idx, (nIdx) => {
            queue.push(nIdx);
        });
    }
    return queue;
}
export function bfsTypedIndices(startIdx, gridSize, visit) {
    const visited = new Uint8Array(gridSize);
    const queue = new Int32Array(gridSize);
    let head = 0;
    let tail = 0;
    visited[startIdx] = 1;
    queue[tail++] = startIdx;
    while (head < tail) {
        const idx = queue[head++];
        const result = visit(idx, visited, (nIdx) => {
            visited[nIdx] = 1;
            queue[tail++] = nIdx;
        });
        if (result !== undefined) return result;
    }
}
// --- NavUtils.js ---
export const SCRATCH_AGENT_POSE = { x: 0, y: 0, vx: 0, vy: 0, desiredX: 0, desiredY: 0, radius: 8 };
export const SCRATCH_PATH_STEERING = { desiredX: 0, desiredY: 0, desiredSpeed: 0, offPath: false };
export function _removeEdgeByTargetId(node, targetId) {
    const edges = node.edges;
    if (!edges || !edges.buffer) return;
    let count = node.edgeCount;
    for (let i = count - 1; i >= 0; i--)
        if (edges[i * 2] === targetId) {
            // Swap with last
            count--;
            if (i !== count) {
                edges[i * 2] = edges[count * 2];
                edges[i * 2 + 1] = edges[count * 2 + 1];
            }
        }
    node.edgeCount = count;
}
export function _removeCellByIdx(cells, idx) {
    for (let i = cells.length - 1; i >= 0; i--) if (cells[i] === idx) cells.splice(i, 1);
}
export const STALE_F_EPSILON = 1e-4;
export function preparedSearchState(searchState) {
    return searchState.prepare();
}
export function reconstructIndexPathInto(cameFrom, targetIdx, outPath) {
    let count = 0;
    let node = targetIdx;
    while (node !== -1) {
        outPath[count++] = node;
        node = cameFrom[node];
    }
    for (let i = 0; i < count >> 1; i++) {
        const tmp = outPath[i];
        outPath[i] = outPath[count - 1 - i];
        outPath[count - 1 - i] = tmp;
    }
    return count;
}
export const globalOpenSet = new IdxMinHeap();
export function canStepEitherDirection(grid, navTopology, idx, nIdx) {
    return grid.canStep(idx, nIdx, navTopology) || grid.canStep(nIdx, idx, navTopology);
}
export function navWalkableCacheKey(state) {
    const grid = state.obstacleGrid;
    const worker = state.nav?.worker;
    const key = gridNavCacheKey(grid);
    if (!worker || !isNavTopologyReady(worker, grid)) return `${key}:pending`;
    return key;
}
export function updateNavWalkableCandidatesInPatch(state, cache, patchBounds) {
    const grid = state.obstacleGrid;
    const navTopology = state.nav.topology;
    const boundsConfig = cache.boundsConfig;
    const { cols } = grid;
    cache.candidates = cache.candidates.filter((idx) => {
        const row = (idx / cols) | 0;
        const col = idx - row * cols;
        if (col < patchBounds.startCol || col > patchBounds.endCol || row < patchBounds.startRow || row > patchBounds.endRow) return true;
        const walkable = isNavWalkableCell(grid, navTopology, idx);
        cache.candidateMask[idx] = walkable ? 1 : 0;
        return walkable;
    });
    const seen = new Set(cache.candidates);
    forEachDenseCellInRect(grid, patchBounds.startCol, patchBounds.endCol, patchBounds.startRow, patchBounds.endRow, (idx) => {
        if (!isIdxInMapGenBounds(boundsConfig, grid, idx)) {
            cache.candidateMask[idx] = 0;
            return;
        }
        if (seen.has(idx)) return;
        if (!isNavWalkableCell(grid, navTopology, idx)) {
            cache.candidateMask[idx] = 0;
            return;
        }
        cache.candidateMask[idx] = 1;
        cache.candidates.push(idx);
        seen.add(idx);
    });
}
export function writeNavWalkableFlagsInRect(flags, grid, cells, patchBounds) {
    forEachDenseCellInRect(grid, patchBounds.startCol, patchBounds.endCol, patchBounds.startRow, patchBounds.endRow, (idx) => {
        flags[idx] = 0;
    });
    for (let i = 0; i < cells.length; i++) flags[cells[i]] = 1;
}
export function patchNavWalkableCellIndexRegion(state, cache, idx) {
    const grid = state.obstacleGrid;
    const navTopology = state.nav.topology;
    const patchBounds = typeof idx === "object" && idx !== null ? padCellBoundsInPlace({ startCol: idx.startCol, endCol: idx.endCol, startRow: idx.startRow, endRow: idx.endRow }, grid, 2) : padCellIdxToGrid(idx, grid, 2);
    ensureNavWalkableBuffers(cache, grid);
    updateNavWalkableCandidatesInPatch(state, cache, patchBounds);
    let seedCells = cache.floodSeedBounds ? filterWalkableCellsInBounds(cache.candidates, grid, cache.floodSeedBounds) : cache.candidates;
    if (!seedCells.length) seedCells = cache.candidates;
    const reachedMask = createNavWalkableReachedMask(grid, cache.reachedMask);
    const connected = cache.candidates.length ? floodConnectedNavWalkableCells(grid, navTopology, cache.candidates, cache.candidateMask, seedCells, reachedMask) : [];
    writeNavWalkableFlagsInRect(cache.flags, grid, connected, patchBounds);
    cache.cells = connected;
    cache.reachedMask = reachedMask;
    cache.navCacheKey = navWalkableCacheKey(state);
    return cache;
}
export function ensureNavWalkableBuffers(cache, grid) {
    const { cols, rows } = grid;
    const size = cols * rows;
    if (!cache.flags || cache.flags.length !== size || cache.cols !== cols || cache.rows !== rows) {
        cache.flags = new Uint8Array(size);
        cache.candidateMask = new Uint8Array(size);
        cache.reachedMask = new Uint8Array(size);
        cache.cols = cols;
        cache.rows = rows;
    }
    return cache;
}
export function bakeNavWalkableCellIndex(state, boundsConfig, floodSeedBounds = null) {
    const grid = state.obstacleGrid;
    const navTopology = state.nav.topology;
    const navCacheKey = navWalkableCacheKey(state);
    const candidates = [];
    const size = grid.cols * grid.rows;
    for (let idx = 0; idx < size; idx++) {
        if (!isNavWalkableCell(grid, navTopology, idx)) continue;
        if (isIdxInMapGenBounds(boundsConfig, grid, idx)) candidates.push(idx);
    }
    let seedCells = candidates;
    if (floodSeedBounds) {
        const seeded = filterWalkableCellsInBounds(candidates, grid, floodSeedBounds);
        if (seeded.length) seedCells = seeded;
    }
    const prior = state.editor.navWalkableCellsCache;
    const cache = ensureNavWalkableBuffers({ navCacheKey, boundsConfig, floodSeedBounds, cells: [], flags: prior?.flags, candidateMask: prior?.candidateMask, reachedMask: prior?.reachedMask, cols: prior?.cols, rows: prior?.rows }, grid);
    const candidateMask = createNavWalkableCandidateMask(grid, candidates, cache.candidateMask);
    const reachedMask = createNavWalkableReachedMask(grid, cache.reachedMask);
    const cells = candidates.length ? floodConnectedNavWalkableCells(grid, navTopology, candidates, candidateMask, seedCells, reachedMask) : [];
    writeNavWalkableFlags(cache.flags, cells);
    cache.cells = cells;
    cache.candidates = candidates;
    cache.candidateMask = candidateMask;
    cache.reachedMask = reachedMask;
    state.editor.navWalkableCellsCache = cache;
    return cache;
}
export function navWalkableCacheHit(cache, navCacheKey, boundsConfig, floodSeedBounds) {
    return cache && navCacheKey && cache.navCacheKey === navCacheKey && cache.boundsConfig === boundsConfig && cache.floodSeedBounds === floodSeedBounds;
}
export const CARDINAL_COSTS = new Float32Array([1, 1, 1, 1]);
export const OCTILE_COSTS = new Float32Array([1, 1, 1, 1, Math.SQRT2, Math.SQRT2, Math.SQRT2, Math.SQRT2]);
export function logHpaReplanFailure(grid, worker, navTopology, startX, startY, targetX, targetY) {
    let startIdx = grid.worldToIdx(startX, startY);
    if (startIdx < 0) {
        console.warn("HPA replan failed: start out of bounds", { startX, startY, targetX, targetY });
        return;
    }
    let targetIdx = grid.worldToIdx(targetX, targetY);
    if (targetIdx < 0) {
        console.warn("HPA replan failed: target out of bounds", { startX, startY, targetX, targetY });
        return;
    }
    if (grid.isBlockedIdx(startIdx)) {
        console.warn("HPA replan failed: start blocked", { startIdx, targetIdx });
        return;
    }
    if (grid.isBlockedIdx(targetIdx)) {
        console.warn("HPA replan failed: target blocked", { startIdx, targetIdx });
        return;
    }
    startIdx = findNearestOpenCellIdx(grid.grid, grid, startIdx);
    targetIdx = findNearestOpenCellIdx(grid.grid, grid, targetIdx);
    const snappedTargetIdx = snapNavGoalCellIndex(grid, startIdx, targetIdx);
    const topology = navTopology?.topology ?? navTopology;
    const blocked = topology?.blocked ?? grid.grid;
    const octileNeighbors = topology?.octileNeighbors;
    const cellToComponent = octileNeighbors ? buildNavComponentMap(blocked, octileNeighbors, grid.cols, grid.rows, grid.activePortalPairs, grid.activePortalCount) : null;
    const startComp = cellToComponent ? cellToComponent[startIdx] : REGION_CELL_UNASSIGNED;
    const targetComp = cellToComponent ? cellToComponent[snappedTargetIdx] : REGION_CELL_UNASSIGNED;
    const cellToRegion = worker.graphCellToRegion;
    const startRegion = cellToRegion ? cellToRegion[startIdx] : REGION_CELL_UNASSIGNED;
    const targetRegion = cellToRegion ? cellToRegion[snappedTargetIdx] : REGION_CELL_UNASSIGNED;
    let reason;
    if (cellToComponent && startComp !== targetComp) reason = "different walkable components (truly unreachable)";
    else if (startRegion < 0 || targetRegion < 0) reason = "cell reachable in grid but HPA region missing (pruned from search graph)";
    else if (startRegion === targetRegion) reason = "same region but local search returned no path";
    else reason = "abstract search found no edge path between regions";
    console.warn("HPA replan failed:", reason, { startIdx, targetIdx, snappedTargetIdx, startComp, targetComp, startRegion, targetRegion });
}
export const globalReplanPayload = { startIdx: 0, targetIdx: 0 };
export function haloEditBounds(idxOrBounds, frame) {
    if (typeof idxOrBounds === "object") return padCellBoundsInPlace({ startCol: idxOrBounds.startCol, endCol: idxOrBounds.endCol, startRow: idxOrBounds.startRow, endRow: idxOrBounds.endRow }, frame, 1);
    return padCellIdxToGrid(idxOrBounds, frame, 1);
}
export function regionsShareDirectedPassableLink(navGraph, frame, nodeA, nodeB) {
    if (!nodeA || !nodeB || nodeA.id === nodeB.id) return false;
    const { cols, rows } = frame;
    const targetCells = new Set(nodeB.cells);
    for (let i = 0; i < nodeA.cells.length; i++) {
        const idx = nodeA.cells[i];
        const col = idx % cols;
        const row = (idx / cols) | 0;
        for (let dir = 0; dir < OCTILE_DIR_COUNT; dir++) {
            const nCol = col + OCTILE_DCOL[dir];
            const nRow = row + OCTILE_DR[dir];
            if (nCol >= 0 && nCol < cols && nRow >= 0 && nRow < rows) {
                const nIdx = nRow * cols + nCol;
                if (targetCells.has(nIdx) && navGraph.canStepIdx(idx, nIdx)) return true;
            }
        }
    }
    return false;
}
export function validateRegionEdges(navGraph, frame, node, graph) {
    if (!node) return;
    node.edges = node.edges.filter((edge) => {
        const other = graph.getNode(edge.targetId);
        return other && regionsShareDirectedPassableLink(navGraph, frame, node, other);
    });
}
export function reconnectRegionEdges(navGraph, blocked, frame, graph, node) {
    if (!node) return;
    const { cols, rows } = frame;
    for (const edge of [...node.edges]) graph.stripEdgesBetween(node, graph.getNode(edge.targetId));
    for (const other of graph.nodes()) if (other.id !== node.id) _removeEdgeByTargetId(other.edges, node.id);
    const neighborIds = new Set();
    const nodeCells = node.cells;
    for (let i = 0; i < nodeCells.length; i++) {
        const idx = nodeCells[i];
        const col = idx % cols;
        const row = (idx / cols) | 0;
        for (let dir = 0; dir < OCTILE_DIR_COUNT; dir++) {
            const nCol = col + OCTILE_DCOL[dir];
            const nRow = row + OCTILE_DR[dir];
            if (nCol >= 0 && nCol < cols && nRow >= 0 && nRow < rows) {
                const nIdx = nRow * cols + nCol;
                if (blocked[nIdx]) continue;
                if (!navGraph.canStepIdx(idx, nIdx) && !navGraph.canStepIdx(nIdx, idx)) continue;
                const other = graph.nodeForCell(nIdx);
                if (other && other.id !== node.id) neighborIds.add(other.id);
            }
        }
    }
    for (const otherId of neighborIds) {
        const other = graph.getNode(otherId);
        if (!other) continue;
        if (regionsShareDirectedPassableLink(navGraph, frame, node, other)) graph.connectEdge(node, other);
        if (regionsShareDirectedPassableLink(navGraph, frame, other, node)) graph.connectEdge(other, node);
    }
}
export function createRegionFromCells(cells, blocked, frame, maxCellsPerChunk, minCellsPerChunk, navGraph, distToWall, graph) {
    const { cols, rows } = frame;
    if (cells.length === 0) return { newIds: [], nodeIdCounter: graph.nodeIdCounter };
    if (!distToWall || distToWall.length !== cols * rows) distToWall = computeDistanceTransform(blocked, frame, distToWall);
    const unassigned = new Set(cells);
    const starts = [...unassigned].sort((a, b) => distToWall[b] - distToWall[a]);
    const newIds = [];
    for (let s = 0; s < starts.length; s++) {
        const startIdx = starts[s];
        if (!unassigned.has(startIdx)) continue;
        const node = graph.createRegionAtCell(startIdx);
        node.cells.length = 0;
        floodFillRegion(startIdx, node, blocked, frame, graph.cellToNode, node.cells, maxCellsPerChunk, navGraph, unassigned);
        repositionNodeCentroid(node, graph.cellToNode, blocked, frame, graph.nodesMap);
        newIds.push(node.id);
    }
    if (minCellsPerChunk > 0) mergeSmallRegions(graph.nodesMap, graph.cellToNode, frame, minCellsPerChunk, navGraph);
    repositionRegionCentroids(graph.nodesMap, blocked, frame, graph.cellToNode);
    return { newIds, nodeIdCounter: graph.nodeIdCounter, distToWall };
}
export function ensureOpenCellsAssigned(graph, blocked, frame, navGraph, distToWall, maxCellsPerChunk, minCellsPerChunk) {
    const size = frame.cols * frame.rows;
    const orphans = [];
    for (let i = 0; i < size; i++) if (!blocked[i] && graph.cellToNode[i] === -1) orphans.push(i);
    if (orphans.length === 0) return distToWall;
    return createRegionFromCells(orphans, blocked, frame, maxCellsPerChunk, minCellsPerChunk, navGraph, distToWall, graph).distToWall;
}
export function activePortalPairCount(activePortalCount) {
    return activePortalCount ? (typeof activePortalCount === "number" ? activePortalCount : activePortalCount[0]) : 0;
}
export function forEachNavWalkNeighbor(idx, blocked, octileNeighbors, activePortalPairs, portalCount, visit) {
    for (let dir = 0; dir < OCTILE_DIR_COUNT; dir++) {
        const nIdx = octileNeighbors[octileNeighborOffset(idx, dir)];
        if (nIdx >= 0 && !blocked[nIdx]) visit(nIdx);
    }
    if (activePortalPairs && portalCount > 0)
        for (let i = 0; i < portalCount; i++)
            if (idx === activePortalPairs[i * 2]) {
                const entryIdx = activePortalPairs[i * 2 + 1];
                if (!blocked[entryIdx]) visit(entryIdx);
            }
}
export function stripBlockedCellsFromRegions(blocked, frame, bounds, graph) {
    const { cols } = frame;
    const touched = new Set();
    forEachDenseCellInBounds(frame, bounds, (idx) => {
        if (!blocked[idx]) return;
        const node = graph.stripCellFromRegion(idx);
        if (!node) return;
        touched.add(node.id);
    });
    for (const id of [...touched]) {
        const node = graph.getNode(id);
        if (!node) continue;
        if (node.cells.length === 0) {
            graph.removeRegion(node);
            continue;
        }
        repositionNodeCentroid(node, graph.cellToNode, blocked, frame, graph.nodesMap);
    }
}
export function repackHullRegions(blocked, frame, maxCellsPerChunk, minCellsPerChunk, navGraph, distToWall, graph, bounds) {
    const { cols } = frame;
    const regionIds = graph.collectRegionIdsInBounds(bounds);
    const cells = new Set();
    for (const id of regionIds) {
        const node = graph.getNode(id);
        if (!node) continue;
        for (let i = 0; i < node.cells.length; i++) cells.add(node.cells[i]);
        graph.removeRegion(node);
    }
    forEachDenseCellInBounds(frame, bounds, (idx) => {
        if (!blocked[idx]) cells.add(idx);
    });
    if (cells.size === 0) return { repackedIds: [], nodeIdCounter: graph.nodeIdCounter, distToWall };
    distToWall = computeDistanceTransform(blocked, frame, distToWall);
    const { newIds, nodeIdCounter: nextCounter, distToWall: dist } = createRegionFromCells([...cells], blocked, frame, maxCellsPerChunk, minCellsPerChunk, navGraph, distToWall, graph);
    return { repackedIds: newIds, nodeIdCounter: nextCounter, distToWall: dist };
}
export function connectAllNodes(navGraph, blocked, frame, graph) {
    graph.clearAllEdges();
    const { cols, rows } = frame;
    forEachDenseCellInBounds(frame, cellBoundsForGrid(frame), (idx) => {
        const col = idx % cols;
        const row = (idx / cols) | 0;
        const node = graph.nodeForCell(idx);
        if (!node) return;
        if (col + 1 < cols) {
            const nIdx = idx + 1;
            const other = graph.nodeForCell(nIdx);
            if (other && other.id !== node.id) {
                if (navGraph.canStepIdx(idx, nIdx)) graph.connectEdge(node, other);
                if (navGraph.canStepIdx(nIdx, idx)) graph.connectEdge(other, node);
            }
        }
        if (row + 1 < rows) {
            const nIdx = idx + cols;
            const other = graph.nodeForCell(nIdx);
            if (other && other.id !== node.id) {
                if (navGraph.canStepIdx(idx, nIdx)) graph.connectEdge(node, other);
                if (navGraph.canStepIdx(nIdx, idx)) graph.connectEdge(other, node);
            }
        }
        if (col + 1 < cols && row + 1 < rows) {
            const nIdx = idx + cols + 1;
            const other = graph.nodeForCell(nIdx);
            if (other && other.id !== node.id) {
                if (navGraph.canStepIdx(idx, nIdx)) graph.connectEdge(node, other);
                if (navGraph.canStepIdx(nIdx, idx)) graph.connectEdge(other, node);
            }
        }
        if (col - 1 >= 0 && row + 1 < rows) {
            const nIdx = idx + cols - 1;
            const other = graph.nodeForCell(nIdx);
            if (other && other.id !== node.id) {
                if (navGraph.canStepIdx(idx, nIdx)) graph.connectEdge(node, other);
                if (navGraph.canStepIdx(nIdx, idx)) graph.connectEdge(other, node);
            }
        }
    });
    for (const node of graph.nodes()) validateRegionEdges(navGraph, frame, node, graph);
}
export function pruneUnreachableRegions(navGraph, blocked, frame, graph, seedWorldX, seedWorldY, activePortalPairs = null, activePortalCount = null) {
    const { cols, rows } = frame;
    const seedIdx = snapshotWorldToIdx(frame, seedWorldX, seedWorldY);
    const startIdx = findNearestOpenCellIdx(blocked, frame, seedIdx);
    const reachable = new Uint8Array(cols * rows);
    reachable[startIdx] = 1;
    bfsIndices([startIdx], (idx, enqueue) => {
        const col = idx % cols;
        const row = (idx / cols) | 0;
        for (let dir = 0; dir < OCTILE_DIR_COUNT; dir++) {
            const nCol = col + OCTILE_DCOL[dir];
            const nRow = row + OCTILE_DR[dir];
            if (nCol < 0 || nCol >= cols || nRow < 0 || nRow >= rows) continue;
            const nIdx = nRow * cols + nCol;
            if (blocked[nIdx] || reachable[nIdx]) continue;
            if (!navGraph.canStepIdx(idx, nIdx) && !navGraph.canStepIdx(nIdx, idx)) continue;
            reachable[nIdx] = 1;
            enqueue(nIdx);
        }
        if (activePortalPairs && activePortalCount) {
            const pairs = activePortalPairs;
            const count = typeof activePortalCount === "number" ? activePortalCount : activePortalCount[0];
            for (let i = 0; i < count; i++) {
                const exitIdx = pairs[i * 2];
                const entryIdx = pairs[i * 2 + 1];
                if (idx === exitIdx && !blocked[entryIdx] && !reachable[entryIdx]) {
                    reachable[entryIdx] = 1;
                    enqueue(entryIdx);
                }
                if (idx === entryIdx && !blocked[exitIdx] && !reachable[exitIdx]) {
                    reachable[exitIdx] = 1;
                    enqueue(exitIdx);
                }
            }
        }
    });
    for (const node of graph.nodes()) {
        let hasReachableCell = false;
        for (let i = 0; i < node.cells.length; i++)
            if (reachable[node.cells[i]]) {
                hasReachableCell = true;
                break;
            }
        if (hasReachableCell) continue;
        graph.removeRegion(node);
    }
    for (const node of graph.nodes())
        if (node.edges && node.edges.buffer) {
            let count = node.edgeCount;
            for (let i = count - 1; i >= 0; i--)
                if (!graph.getNode(node.edges[i * 2])) {
                    count--;
                    if (i !== count) {
                        node.edges[i * 2] = node.edges[count * 2];
                        node.edges[i * 2 + 1] = node.edges[count * 2 + 1];
                    }
                }
            node.edgeCount = count;
        }
}
export function pruneUnreachableRegionsFromGridCenter(navGraph, blocked, frame, graph, activePortalPairs = null, activePortalCount = null) {
    const seedWorldX = frame.minX + frame.cols * frame.cellSize * 0.5;
    const seedWorldY = frame.minY + frame.rows * frame.cellSize * 0.5;
    pruneUnreachableRegions(navGraph, blocked, frame, graph, seedWorldX, seedWorldY, activePortalPairs, activePortalCount);
}
export function ensureNodeEdgesCapacity(node, required) {
    if (!node.edges || !node.edges.buffer) {
        let capacity = 16;
        while (capacity < required * 2) capacity *= 2;
        const newArray = new Int32Array(capacity);
        let count = 0;
        if (node.edges && Array.isArray(node.edges)) {
            for (let i = 0; i < node.edges.length; i++) {
                newArray[i * 2] = node.edges[i].targetId;
                newArray[i * 2 + 1] = node.edges[i].cost;
            }
            count = node.edges.length;
        }
        node.edges = newArray;
        node.edgeCount = count;
    } else {
        let capacity = node.edges.length;
        if (capacity < required * 2) {
            while (capacity < required * 2) capacity *= 2;
            const newArray = new Int32Array(capacity);
            newArray.set(node.edges);
            node.edges = newArray;
        }
    }
}
export function injectPortalEdges(activePortalPairs, activePortalCount, blocked, graph) {
    if (!activePortalPairs || !activePortalCount) return;
    const pairs = activePortalPairs;
    const count = typeof activePortalCount === "number" ? activePortalCount : activePortalCount[0];
    for (const node of graph.nodes())
        if (node.edges && node.edges.buffer) {
            let eCount = node.edgeCount;
            for (let i = eCount - 1; i >= 0; i--)
                if (node.edges[i * 2 + 1] === 0) {
                    eCount--;
                    if (i !== eCount) {
                        node.edges[i * 2] = node.edges[eCount * 2];
                        node.edges[i * 2 + 1] = node.edges[eCount * 2 + 1];
                    }
                }
            node.edgeCount = eCount;
        }
    for (let i = 0; i < count; i++) {
        const exitIdx = pairs[i * 2];
        const entryIdx = pairs[i * 2 + 1];
        if (blocked[exitIdx] || blocked[entryIdx]) continue;
        const nodeExit = graph.nodeForCell(exitIdx);
        const nodeEntry = graph.nodeForCell(entryIdx);
        if (!nodeExit || !nodeEntry || nodeExit.id === nodeEntry.id) continue;
        let hasEdge = false;
        if (nodeExit.edges && nodeExit.edges.buffer)
            for (let e = 0; e < nodeExit.edgeCount; e++) {
                if (nodeExit.edges[e * 2] === nodeEntry.id) {
                    hasEdge = true;
                    break;
                }
            }
        else if (nodeExit.edges && Array.isArray(nodeExit.edges)) hasEdge = nodeExit.edges.some((e) => e.targetId === nodeEntry.id);
        if (!hasEdge) {
            ensureNodeEdgesCapacity(nodeExit, (nodeExit.edgeCount || 0) + 1);
            const idx = nodeExit.edgeCount++;
            nodeExit.edges[idx * 2] = nodeEntry.id;
            nodeExit.edges[idx * 2 + 1] = 0;
        }
    }
}
export function collectCellsForRegionCluster(graph, cluster) {
    const cells = [];
    for (const regionId of cluster) {
        const node = graph.getNode(regionId);
        if (!node) continue;
        for (let i = 0; i < node.cells.length; i++) cells.push(node.cells[i]);
    }
    return cells;
}
export function findAbstractRegionClusters(regionIds, regionAdj) {
    const clusters = [];
    const remaining = new Set(regionIds);
    while (remaining.size > 0) {
        const start = remaining.values().next().value;
        remaining.delete(start);
        const cluster = new Set([start]);
        const q = [start];
        for (let qi = 0; qi < q.length; qi++) {
            const regionId = q[qi];
            const neighbors = regionAdj.get(regionId);
            if (!neighbors) continue;
            for (let i = 0; i < neighbors.length; i++) {
                const next = neighbors[i];
                if (!remaining.has(next)) continue;
                remaining.delete(next);
                cluster.add(next);
                q.push(next);
            }
        }
        clusters.push(cluster);
    }
    return clusters;
}
export function findCellPathBetweenRegionClusters(graph, blocked, octileNeighbors, activePortalPairs, portalCount, cellToComponent, comp, clusterA, clusterB) {
    const size = blocked.length;
    const visited = new Uint8Array(size);
    const parent = new Int32Array(size);
    parent.fill(-1);
    const q = [];
    const seedCells = collectCellsForRegionCluster(graph, clusterA);
    for (let i = 0; i < seedCells.length; i++) {
        const idx = seedCells[i];
        if (cellToComponent[idx] !== comp || visited[idx]) continue;
        visited[idx] = 1;
        q.push(idx);
    }
    let goal = -1;
    for (let qi = 0; qi < q.length && goal < 0; qi++) {
        const idx = q[qi];
        const node = graph.nodeForCell(idx);
        if (node && clusterB.has(node.id)) {
            goal = idx;
            break;
        }
        forEachNavWalkNeighbor(idx, blocked, octileNeighbors, activePortalPairs, portalCount, (nIdx) => {
            if (cellToComponent[nIdx] !== comp || visited[nIdx]) return;
            visited[nIdx] = 1;
            parent[nIdx] = idx;
            q.push(nIdx);
        });
    }
    if (goal < 0) return null;
    const path = [];
    let cur = goal;
    while (cur >= 0) {
        path.push(cur);
        cur = parent[cur];
    }
    path.reverse();
    return path;
}
export function applyRegionBridgePath(graph, navGraph, frame, path) {
    for (let i = 0; i < path.length - 1; i++) {
        const fromIdx = path[i];
        const toIdx = path[i + 1];
        if (!navGraph.canStepIdx(fromIdx, toIdx)) continue;
        const fromNode = graph.nodeForCell(fromIdx);
        const toNode = graph.nodeForCell(toIdx);
        if (!fromNode || !toNode || fromNode.id === toNode.id) continue;
        if (!regionsShareDirectedPassableLink(navGraph, frame, fromNode, toNode)) continue;
        graph.connectEdge(fromNode, toNode);
    }
}
export function bridgeRegionGraphByWalkableComponent(navGraph, blocked, frame, graph, octileNeighbors, activePortalPairs, activePortalCount) {
    if (!octileNeighbors) return;
    const { cols, rows } = frame;
    const size = cols * rows;
    const cellToComponent = buildNavComponentMap(blocked, octileNeighbors, cols, rows, activePortalPairs, activePortalCount);
    const portalCount = activePortalPairCount(activePortalCount);
    const compRegions = new Map();
    for (const node of graph.nodes()) {
        if (!node.cells.length) continue;
        const comp = cellToComponent[node.cells[0]];
        if (comp < 0) continue;
        let regions = compRegions.get(comp);
        if (!regions) {
            regions = new Set();
            compRegions.set(comp, regions);
        }
        regions.add(node.id);
    }
    const regionAdj = new Map();
    for (const node of graph.nodes()) {
        const neighbors = [];
        if (node.edges && node.edges.buffer) for (let i = 0; i < node.edgeCount; i++) neighbors.push(node.edges[i * 2]);
        else if (node.edges) for (let i = 0; i < node.edges.length; i++) neighbors.push(node.edges[i].targetId);
        regionAdj.set(node.id, neighbors);
    }
    for (const regionIds of compRegions.values()) {
        const clusters = findAbstractRegionClusters(regionIds, regionAdj);
        if (clusters.length <= 1) continue;
        let merged = clusters[0];
        for (let c = 1; c < clusters.length; c++) {
            const targetCluster = clusters[c];
            const mergedCells = collectCellsForRegionCluster(graph, merged);
            if (!mergedCells.length) continue;
            const comp = cellToComponent[mergedCells[0]];
            const path = findCellPathBetweenRegionClusters(graph, blocked, octileNeighbors, activePortalPairs, portalCount, cellToComponent, comp, merged, targetCluster);
            if (!path) continue;
            applyRegionBridgePath(graph, navGraph, frame, path);
            for (const regionId of targetCluster) {
                merged.add(regionId);
                const neighbors = regionAdj.get(regionId);
                if (!neighbors) regionAdj.set(regionId, []);
                else regionAdj.set(regionId, [...neighbors]);
            }
            for (const node of graph.nodes()) {
                const neighbors = [];
                if (node.edges && node.edges.buffer) for (let i = 0; i < node.edgeCount; i++) neighbors.push(node.edges[i * 2]);
                else if (node.edges) for (let i = 0; i < node.edges.length; i++) neighbors.push(node.edges[i].targetId);
                regionAdj.set(node.id, neighbors);
            }
        }
    }
    for (const node of graph.nodes()) validateRegionEdges(navGraph, frame, node, graph);
}
export const localBakeArenas = new WeakMap();
export function ensureLocalBakeArena(grid) {
    const cellCount = grid.cols * grid.rows;
    const vertCount = (grid.cols + 1) * (grid.rows + 1);
    let arena = localBakeArenas.get(grid);
    if (!arena || arena.cellCount !== cellCount) {
        arena = createNavTopologySabArena(cellCount, vertCount, grid.cols, grid.rows);
        localBakeArenas.set(grid, arena);
    }
    return arena;
}
export const OCTILE_REVERSE_DIR = [2, 3, 0, 1, 6, 7, 4, 5];
export const PATH_WAYPOINT_ARRIVAL_PX = 16;
export function pathSegmentIsDiscontinuousHop(navTopology, fromIdx, toIdx) {
    if (fromIdx < 0 || toIdx < 0 || !navTopology) return false;
    if (typeof navTopology.canStep === "function") return !navTopology.canStep(fromIdx, toIdx);
    const frame = navTopology.frame;
    const topology = navTopology.topology ?? navTopology;
    if (frame && topology?.octileNeighbors) return !navCanStep(frame, topology, fromIdx, toIdx);
    return false;
}
export function sabWaypointArrived(bodyX, bodyY, bodyIdx, worker, slot, i, arrivalPx, grid, navTopology) {
    const idx = worker.pathIdx(slot, i);
    const wx = grid.gridCenterXByIdx(idx);
    const wy = grid.gridCenterYByIdx(idx);
    if (Math.hypot(wx - bodyX, wy - bodyY) <= arrivalPx) return true;
    if (i > 0) {
        const prevIdx = worker.pathIdx(slot, i - 1);
        const prevWx = grid.gridCenterXByIdx(prevIdx);
        const prevWy = grid.gridCenterYByIdx(prevIdx);
        const dx_seg = wx - prevWx;
        const dy_seg = wy - prevWy;
        const dx_agent = bodyX - wx;
        const dy_agent = bodyY - wy;
        const segLen = Math.hypot(dx_seg, dy_seg);
        if (segLen > 0.001) {
            const dot = (dx_seg / segLen) * dx_agent + (dy_seg / segLen) * dy_agent;
            if (dot > 0 && Math.abs(dot) < grid.cellSize * 1.5) return true;
        }
    }
    if (bodyIdx === idx) return true;
    if (i > 0) {
        const prevIdx = worker.pathIdx(slot, i - 1);
        if (pathSegmentIsDiscontinuousHop(navTopology, prevIdx, idx)) return bodyIdx === idx || bodyIdx === prevIdx;
    }
    return grid.canStep(bodyIdx, idx, navTopology);
}
export const tempWallProxies = [];
export const tempCornerProxies = [];
export class PathSteeringEvaluator {
    constructor() {
        this.x = 0;
        this.y = 0;
        this.vx = 0;
        this.vy = 0;
        this.radius = 0;
        this.worker = null;
        this.slot = -1;
        this.pathLen = 0;
        this.grid = null;
        this.settings = null;
        this.clearanceRadius = 0;
        this.centeredClearance = 0;
        this.hasNearWalls = false;
    }
    init(pose, worker, slot, pathLen, grid, settings) {
        this.x = pose.x;
        this.y = pose.y;
        this.vx = pose.vx ?? 0;
        this.vy = pose.vy ?? 0;
        this.radius = resolveBodyRadius(pose);
        this.worker = worker;
        this.slot = slot;
        this.pathLen = pathLen;
        this.grid = grid;
        this.settings = settings;
        this.clearanceRadius = 0;
        this.centeredClearance = 0;
        this.hasNearWalls = false;
    }
    getPathX(step) {
        return this.grid.gridCenterXByIdx(this.worker.pathIdx(this.slot, step));
    }
    getPathY(step) {
        return this.grid.gridCenterYByIdx(this.worker.pathIdx(this.slot, step));
    }
    resolveClearanceRadius() {
        const bodyRadius = this.radius;
        tempWallProxies.length = 0;
        this.grid.appendStaticWallProxiesNearWorld(this.x, this.y, bodyRadius + this.grid.cellSize, tempWallProxies);
        let wallThickness = 4; // Default thickness fallback
        for (let i = 0; i < tempWallProxies.length; i++) {
            const wall = tempWallProxies[i];
            const thickness = Math.min(wall.width !== undefined ? wall.width : wall.size, wall.height !== undefined ? wall.height : wall.size);
            if (thickness > 0 && thickness < this.grid.cellSize) wallThickness = Math.max(wallThickness, thickness);
        }
        this.hasNearWalls = tempWallProxies.length > 0;
        tempWallProxies.length = 0; // Clear references to prevent memory leaks
        const freeHalfWidth = (this.grid.cellSize - wallThickness) * 0.5;
        const centeredClearance = freeHalfWidth - bodyRadius;
        this.centeredClearance = centeredClearance;
        const safetyPadding = Math.max(0, centeredClearance * 0.85);
        this.clearanceRadius = bodyRadius + safetyPadding;
    }
    findLookaheadStep(step) {
        const maxLookahead = this.hasNearWalls ? 1 : 4;
        let lookaheadStep = step + 1;
        let validLookaheadStep = step;
        while (lookaheadStep < step + maxLookahead && lookaheadStep < this.pathLen) {
            const lx = this.getPathX(lookaheadStep);
            const ly = this.getPathY(lookaheadStep);
            if (hasLineOfSight(this.x, this.y, lx, ly, this.grid, this.clearanceRadius)) validLookaheadStep = lookaheadStep;
            else break; // Stop looking ahead if line of sight is broken by walls/corners
            lookaheadStep++;
        }
        return validLookaheadStep;
    }
    calculateCornerSlowdown(progressStep, maxSpeed, accel, currentDesiredSpeed) {
        let desiredSpeed = currentDesiredSpeed;
        const minCornerSpeed = Math.min(30.0, maxSpeed * 0.35);
        const startCheck = Math.max(1, progressStep - 1);
        const endCheck = Math.min(this.pathLen - 2, progressStep + 3);
        for (let i = startCheck; i <= endCheck; i++) {
            const idxPrev = this.worker.pathIdx(this.slot, i - 1);
            const idxCurr = this.worker.pathIdx(this.slot, i);
            const idxNext = this.worker.pathIdx(this.slot, i + 1);
            const xPrev = this.grid.gridCenterXByIdx(idxPrev);
            const yPrev = this.grid.gridCenterYByIdx(idxPrev);
            const xCurr = this.grid.gridCenterXByIdx(idxCurr);
            const yCurr = this.grid.gridCenterYByIdx(idxCurr);
            const xNext = this.grid.gridCenterXByIdx(idxNext);
            const yNext = this.grid.gridCenterYByIdx(idxNext);
            const dx0 = xCurr - xPrev;
            const dy0 = yCurr - yPrev;
            const dx1 = xNext - xCurr;
            const dy1 = yNext - yCurr;
            const d0 = Math.hypot(dx0, dy0);
            const d1 = Math.hypot(dx1, dy1);
            if (d0 > 0.001 && d1 > 0.001) {
                const cosTheta = (dx0 * dx1 + dy0 * dy1) / (d0 * d1);
                if (cosTheta < 0.95) {
                    tempCornerProxies.length = 0;
                    this.grid.appendStaticWallProxiesNearWorld(xCurr, yCurr, this.radius + this.grid.cellSize, tempCornerProxies);
                    let cornerWallThickness = 4;
                    for (let w = 0; w < tempCornerProxies.length; w++) {
                        const wall = tempCornerProxies[w];
                        const thickness = Math.min(wall.width !== undefined ? wall.width : wall.size, wall.height !== undefined ? wall.height : wall.size);
                        if (thickness > 0 && thickness < this.grid.cellSize) cornerWallThickness = Math.max(cornerWallThickness, thickness);
                    }
                    const hasNearWallsAtCorner = tempCornerProxies.length > 0;
                    tempCornerProxies.length = 0;
                    const cornerFreeHalfWidth = (this.grid.cellSize - cornerWallThickness) * 0.5;
                    const cornerClearance = cornerFreeHalfWidth - this.radius;
                    const maxDev = hasNearWallsAtCorner ? Math.max(0.5, cornerClearance * 0.75) : 4.0;
                    const invCos = 1.0 - Math.max(-1.0, Math.min(1.0, cosTheta));
                    const cornerSpeed = Math.max(minCornerSpeed, Math.min(maxSpeed, Math.sqrt((accel * maxDev) / invCos)));
                    const distToCorner = Math.hypot(xCurr - this.x, yCurr - this.y);
                    const brakingDistance = (maxSpeed * maxSpeed - cornerSpeed * cornerSpeed) / (2 * accel);
                    if (distToCorner < brakingDistance) {
                        const limit = Math.sqrt(cornerSpeed * cornerSpeed + 2 * accel * distToCorner);
                        desiredSpeed = Math.min(desiredSpeed, limit);
                    }
                }
            }
        }
        return desiredSpeed;
    }
    calculateAlignmentSlowdown(steerX, steerY, dx, dy, dist, maxSpeed, accel, currentDesiredSpeed) {
        const speed = Math.hypot(this.vx, this.vy);
        if (speed <= 20.0 || dist < 0.01) return currentDesiredSpeed;
        const dirX = this.vx / speed;
        const dirY = this.vy / speed;
        const tx = dx / dist;
        const ty = dy / dist;
        const cosAlign = dirX * tx + dirY * ty;
        if (cosAlign < 0.95) {
            tempCornerProxies.length = 0;
            this.grid.appendStaticWallProxiesNearWorld(steerX, steerY, this.radius + this.grid.cellSize, tempCornerProxies);
            let targetWallThickness = 4;
            for (let w = 0; w < tempCornerProxies.length; w++) {
                const wall = tempCornerProxies[w];
                const thickness = Math.min(wall.width !== undefined ? wall.width : wall.size, wall.height !== undefined ? wall.height : wall.size);
                if (thickness > 0 && thickness < this.grid.cellSize) targetWallThickness = Math.max(targetWallThickness, thickness);
            }
            const hasNearWallsAtTarget = tempCornerProxies.length > 0;
            tempCornerProxies.length = 0;
            const targetFreeHalfWidth = (this.grid.cellSize - targetWallThickness) * 0.5;
            const targetClearance = targetFreeHalfWidth - this.radius;
            const maxDevAlign = hasNearWallsAtTarget ? Math.max(0.5, targetClearance * 0.75) : 4.0;
            const invCosAlign = 1.0 - Math.max(-1.0, Math.min(1.0, cosAlign));
            const alignSpeed = Math.max(30.0, Math.min(maxSpeed, Math.sqrt((accel * maxDevAlign) / invCosAlign)));
            return Math.min(currentDesiredSpeed, alignSpeed);
        }
        return currentDesiredSpeed;
    }
}
export const tempEvaluator = new PathSteeringEvaluator();
export const MAX_CACHE = 512;
export const FLOW_DONE = "flowDone";
export const FLOW_WINDOW_DONE = "flowWindowDone";
export const FLOW_DECODE_X = new Float32Array([-0.707, 0, 0.707, -1, 0, 1, -0.707, 0, 0.707]);
export const FLOW_DECODE_Y = new Float32Array([-0.707, -1, -0.707, 0, 0, 0, 0.707, 1, 0.707]);
// --- CorridorPathfinder.js ---
export class CorridorPathfinder {
    constructor(grid, navTopology, railConfig, navWalkableIndex) {
        const { originIdx, cols, strideCols, cellCount: stampCellCount } = stampLayoutFromConfig(grid, railConfig);
        this.gridCols = grid.cols;
        this.globalLayout = gridCellLayout(grid);
        const cellCountGlobal = this.gridCols * grid.rows;
        this.walkable = new Uint8Array(cellCountGlobal);
        forEachStampGlobalIdx(originIdx, cols, strideCols, stampCellCount, grid, railConfig, (idx) => {
            if (navWalkableIndex.flags[idx] !== 0) this.walkable[idx] = 1;
        });
        this.searchState = new SearchState(cellCountGlobal);
        this.reservedGlobalIndices = new Set();
        this.pathScratch = new Int32Array(512);
        const walkable = this.walkable;
        const reservedGlobalIndices = () => this.reservedGlobalIndices;
        const gridView = new FlatGridView(this.gridCols, grid.rows, {
            blocked: null,
            canStep(idx0, idx1) {
                return walkable[idx1] && !reservedGlobalIndices().has(idx1) && grid.canStep(idx0, idx1, navTopology);
            },
        });
        this.gridSearch = new FlatGridSearch(this.searchState);
        this.gridSearch.grid = gridView;
        this.gridSearch.gridIdx = gridView.gridIdx;
    }
    setReserved(indices) {
        this.reservedGlobalIndices = indices;
    }
    findCorridorPath(startIdx, endIdx, occupiedGlobalIndices, corridorWidth = 1, maxPathLen = 512) {
        this.setReserved(occupiedGlobalIndices);
        const path = this.findQuery(startIdx, endIdx, maxPathLen);
        if (!path || path.length < 2) return null;
        if (corridorPathHitsOccupied(path, occupiedGlobalIndices, corridorWidth, this.globalLayout, { interiorOnly: false })) return null;
        return path;
    }
    findQuery(startIdx, goalIdx, maxPathLen = 512) {
        if (!this.walkable[startIdx] || !this.walkable[goalIdx]) return null;
        if (this.reservedGlobalIndices.has(startIdx) || this.reservedGlobalIndices.has(goalIdx)) return null;
        if (this.pathScratch.length < maxPathLen) this.pathScratch = new Int32Array(maxPathLen);
        const len = this.gridSearch.cardinal(startIdx, goalIdx, maxPathLen, this.pathScratch);
        if (len === 0) return null;
        return this.pathScratch.slice(0, len);
    }
}
export function findSabPathProgressIdx(x, y, worker, slot, pathLen, grid, navTopology) {
    if (pathLen <= 0) return 0;
    const hereIdx = grid.worldToIdx(x, y);
    let idx = 0;
    for (let i = 0; i < pathLen; i++) if (worker.pathIdx(slot, i) === hereIdx) idx = i + 1;
    if (idx >= pathLen) idx = pathLen - 1;
    const waypointArrival = PATH_WAYPOINT_ARRIVAL_PX;
    while (idx < pathLen - 1) {
        const cellIdx = worker.pathIdx(slot, idx);
        const wx = grid.gridCenterXByIdx(cellIdx);
        const wy = grid.gridCenterYByIdx(cellIdx);
        let arrived = Math.hypot(wx - x, wy - y) <= waypointArrival;
        if (!arrived && idx > 0) {
            const prevIdx = worker.pathIdx(slot, idx - 1);
            const prevWx = grid.gridCenterXByIdx(prevIdx);
            const prevWy = grid.gridCenterYByIdx(prevIdx);
            const dx_seg = wx - prevWx;
            const dy_seg = wy - prevWy;
            const dx_agent = x - wx;
            const dy_agent = y - wy;
            const segLen = Math.hypot(dx_seg, dy_seg);
            if (segLen > 0.001) {
                const dot = (dx_seg / segLen) * dx_agent + (dy_seg / segLen) * dy_agent;
                if (dot > 0 && Math.abs(dot) < grid.cellSize * 1.5) arrived = true;
            }
        }
        if (!arrived) break;
        if (hereIdx === cellIdx) {
            idx++;
            continue;
        }
        const prevCellIdx = idx > 0 ? worker.pathIdx(slot, idx - 1) : -1;
        if (prevCellIdx >= 0 && pathSegmentIsDiscontinuousHop(navTopology, prevCellIdx, cellIdx)) {
            idx++;
            continue;
        }
        if (!grid.canStep(hereIdx, cellIdx, navTopology)) break;
        idx++;
    }
    return idx;
}
export function buildSabPathOverlayFromProgress(x, y, worker, slot, pathLen, progressIdx, grid) {
    if (pathLen <= 0) return { pathNodes: [] };
    const idx = Math.max(0, Math.min(progressIdx ?? 0, pathLen - 1));
    const pathNodes = [];
    for (let i = idx; i < pathLen; i++) {
        const cellIdx = worker.pathIdx(slot, i);
        const node = { x: grid.gridCenterXByIdx(cellIdx), y: grid.gridCenterYByIdx(cellIdx) };
        pathNodes.push(node);
    }
    const first = pathNodes[0];
    if (first && Math.hypot(first.x - x, first.y - y) > 1) {
        const aIdx = grid.worldToIdx(x, y);
        const bIdx = grid.worldToIdx(first.x, first.y);
        if (aIdx >= 0 && bIdx >= 0) {
            const cols = grid.cols;
            const aCol = aIdx % cols;
            const aRow = (aIdx / cols) | 0;
            const bCol = bIdx % cols;
            const bRow = (bIdx / cols) | 0;
            if (Math.abs(aCol - bCol) <= 1 && Math.abs(aRow - bRow) <= 1) pathNodes.unshift({ x, y });
        }
    }
    return { pathNodes };
}
export function computeSabPathSteering(buf, o, pose, worker, slot, pathLen, targetX, targetY, grid, navTopology, settings, navState = null) {
    const x = pose.x;
    const y = pose.y;
    const bodyIdx = grid.worldToIdx(x, y);
    // Initialize evaluator and resolve wall clearance first so we can use its properties
    tempEvaluator.init(pose, worker, slot, pathLen, grid, settings);
    tempEvaluator.resolveClearanceRadius();
    let waypointArrival = settings.pathWaypointArrival;
    if (tempEvaluator.hasNearWalls) waypointArrival = Math.min(waypointArrival, Math.max(3.0, tempEvaluator.radius + 1.0));
    const arrivalDistance = settings.arrivalDistance;
    const offPathDistance = settings.pathOffPathDistance;
    let step = navState?.pathProgressIdx ?? 0;
    if (step >= pathLen) step = pathLen - 1;
    let steerIdx = worker.pathIdx(slot, step);
    let steerX = grid.gridCenterXByIdx(steerIdx);
    let steerY = grid.gridCenterYByIdx(steerIdx);
    let dx = steerX - x;
    let dy = steerY - y;
    let dist = Math.hypot(dx, dy);
    while (dist < waypointArrival && step < pathLen - 1 && sabWaypointArrived(x, y, bodyIdx, worker, slot, step, waypointArrival, grid, navTopology)) {
        step++;
        if (navState) navState.pathProgressIdx = step;
        steerIdx = worker.pathIdx(slot, step);
        steerX = grid.gridCenterXByIdx(steerIdx);
        steerY = grid.gridCenterYByIdx(steerIdx);
        dx = steerX - x;
        dy = steerY - y;
        dist = Math.hypot(dx, dy);
    }
    const progressStep = step;
    const validLookaheadStep = tempEvaluator.findLookaheadStep(step);
    if (validLookaheadStep > step) {
        step = validLookaheadStep;
        if (navState) navState.pathProgressIdx = step;
        steerX = tempEvaluator.getPathX(step);
        steerY = tempEvaluator.getPathY(step);
        dx = steerX - x;
        dy = steerY - y;
        dist = Math.hypot(dx, dy);
    }
    const distToTarget = Math.hypot(targetX - x, targetY - y);
    const nextPathIdx = step < pathLen - 1 ? worker.pathIdx(slot, step + 1) : -1;
    if (nextPathIdx >= 0 && pathSegmentIsDiscontinuousHop(navTopology, steerIdx, nextPathIdx) && bodyIdx === steerIdx) {
        buf[o] = 0;
        buf[o + 1] = 0;
        buf[o + 2] = 0;
        return false;
    }
    if (step >= pathLen - 1 && distToTarget <= arrivalDistance) {
        buf[o] = 0;
        buf[o + 1] = 0;
        buf[o + 2] = 0;
        return false;
    }
    if (!(dist >= 0.01)) {
        buf[o] = 0;
        buf[o + 1] = 0;
        buf[o + 2] = 0;
        return false;
    }
    const maxSpeed = settings.maxSpeed ?? 180;
    const accel = settings.accel ?? 600;
    let desiredSpeed = maxSpeed;
    desiredSpeed = tempEvaluator.calculateCornerSlowdown(progressStep, maxSpeed, accel, desiredSpeed);
    desiredSpeed = tempEvaluator.calculateAlignmentSlowdown(steerX, steerY, dx, dy, dist, maxSpeed, accel, desiredSpeed);
    const decelRadius = Math.max(32.0, (maxSpeed * maxSpeed) / (2.0 * accel));
    if (step >= pathLen - 1 || distToTarget < decelRadius) {
        const arrivalFactor = Math.max(0.15, Math.min(1.0, distToTarget / decelRadius));
        desiredSpeed = Math.min(desiredSpeed, maxSpeed * arrivalFactor);
    }
    buf[o] = dx / dist;
    buf[o + 1] = dy / dist;
    buf[o + 2] = desiredSpeed;
    return dist > offPathDistance;
}
// --- NavRuntime.js ---
export function agentPose(source) {
    SCRATCH_AGENT_POSE.x = source.x;
    SCRATCH_AGENT_POSE.y = source.y;
    SCRATCH_AGENT_POSE.vx = source.vx ?? 0;
    SCRATCH_AGENT_POSE.vy = source.vy ?? 0;
    SCRATCH_AGENT_POSE.desiredX = source.desiredX ?? 0;
    SCRATCH_AGENT_POSE.desiredY = source.desiredY ?? 0;
    SCRATCH_AGENT_POSE.radius = source.radius ?? 8;
    return SCRATCH_AGENT_POSE;
}
export function buildReplanParams(obstacleGrid, startX, startY, targetX, targetY, nav, state = null) {
    return new HpaReplanRequest({ obstacleGrid, startX, startY, targetX, targetY, graphEpoch: nav.graphSyncGeneration, topologyKey: nav.syncedTopologyKey(), navTopology: nav.topology, state });
}
export function replanCellIndicesFromWorldCoords(grid, startX, startY, targetX, targetY) {
    snapNavGoalWorld(ENGINE_F32, N_OUT_XY, grid, startX, startY, targetX, targetY);
    const steerX = ENGINE_F32[N_OUT_XY];
    const steerY = ENGINE_F32[N_OUT_XY + 1];
    let startIdx = grid.worldToIdx(startX, startY);
    if (startIdx < 0) startIdx = 0;
    startIdx = findNearestOpenCellIdx(grid.grid, grid, startIdx);
    let targetIdx = grid.worldToIdx(steerX, steerY);
    if (targetIdx < 0) targetIdx = 0;
    targetIdx = findNearestOpenCellIdx(grid.grid, grid, targetIdx);
    return { startIdx, targetIdx: snapNavGoalCellIndex(grid, startIdx, targetIdx), steerX, steerY };
}
export function createNavState() {
    return { lastX: null, lastY: null, stuckFrames: 0, pathProgressIdx: 0, topologyKey: "", lastTargetX: null, lastTargetY: null, lastOffPathReplan: 0, hpaReplanRequestId: 0, pathSlot: -1, pathLen: 0, routeId: 0, pendingReplanReason: null, lastAcceptedRouteReason: null, lastAcceptedPathLen: 0, lastAcceptedProgressIdx: 0, lastAcceptedTargetX: null, lastAcceptedTargetY: null };
}
export class NavRuntime {
    /**
     * @param {object} options
     * @param {WorldObstacleGrid} options.grid
     * @param {HpaPathWorker} options.worker
     * @param {HpaPathSession} options.session
     * @param {FlowFieldGrid | { invalidateNavTopology(): void }} options.flowFieldGrid
     * @param {object} [options.settings]
     */
    constructor({ grid, worker, session, flowFieldGrid, settings = {} }) {
        this.grid = grid;
        this.worker = worker;
        this.session = session;
        this.flowFieldGrid = flowFieldGrid;
        this.settings = settings;
        this.topology = NavTopology.bindWorker(grid, worker);
        worker.setTopologySyncTarget(this.topology);
        worker.ensureNavArenaForGrid(grid);
        this._lastGridTopologyEpoch = grid.gridTopologyEpoch;
        this._workerNavGraphSyncChain = Promise.resolve();
        this._graphSyncGeneration = 0;
        /** @type {NavWalkableSyncHook | null} */
        this._navWalkableSyncHook = null;
        grid._navTopologyRef = this.topology;
    }
    /** Current grid topology key (changes on every nav-affecting edit). */
    topologyKey() {
        return gridNavCacheKey(this.grid);
    }
    /** Worker-acknowledged topology key (null before first sync). */
    syncedTopologyKey() {
        return this.worker._syncedNavCacheKey || "";
    }
    isTopologyCurrent() {
        return isNavTopologyReady(this.worker, this.grid);
    }
    /** Topology arena sync only — no HPA region-graph patch (map-gen preview between belt passes). */
    syncTopology(damageBounds = null, grid = this.grid) {
        return this.worker.scheduleNavTopologySyncAwait(grid, damageBounds);
    }
    /** HPA region-graph generation — bumps after each completed worker graph sync. */
    get graphSyncGeneration() {
        return this._graphSyncGeneration;
    }
    /** @param {NavWalkableSyncHook | null} hook */
    setNavWalkableSyncHook(hook) {
        this._navWalkableSyncHook = hook;
    }
    /**
     * @param {CellBounds | CellBounds[] | null} bounds
     * @param {{ fullNavSync?: boolean }} [options]
     */
    commitEdit(idx, { fullNavSync = false } = {}) {
        return this._scheduleObstacleSync(fullNavSync ? null : idx);
    }
    _scheduleObstacleSync(idx) {
        const topologyChanged = this.grid.gridTopologyEpoch !== this._lastGridTopologyEpoch;
        if (topologyChanged) this._lastGridTopologyEpoch = this.grid.gridTopologyEpoch;
        this.flowFieldGrid.invalidateNavTopology();
        const run = () => this._syncWorkerNavGraph(this.grid, idx, topologyChanged);
        this._workerNavGraphSyncChain = this._workerNavGraphSyncChain.then(run, run);
        return this._workerNavGraphSyncChain;
    }
    awaitWorkerNavReady() {
        return this._workerNavGraphSyncChain;
    }
    async _syncWorkerNavGraph(grid, idx, topologyChanged) {
        const graphEpoch = this._graphSyncGeneration + 1;
        const fullGraph = topologyChanged || idx == null;
        await this.worker.syncObstacleNavGraph(grid, idx, graphEpoch, fullGraph);
        this._graphSyncGeneration = graphEpoch;
        this._navWalkableSyncHook?.(idx);
    }
    async shutdown() {
        this.worker.shutdown();
        await this._workerNavGraphSyncChain.catch(() => {});
        await this.worker.host.worker.terminate();
    }
}
// --- NavReplanPolicy.js ---
export const REPLAN_TARGET_MOVE_PX = 64;
export const REPLAN_OFF_PATH_COOLDOWN_MS = 250;
export const REPLAN_PRIORITY_TARGET = 4;
export const REPLAN_PRIORITY_VISIBLE = 3;
export const REPLAN_PRIORITY_NORMAL = 2;
export const REPLAN_PRIORITY_STUCK_OFFSCREEN = 1;
export class PathReplanManager {
    constructor(navState) {
        this.navState = navState;
        this.replanClockMs = 0;
    }
    updateClock(dtMs) {
        this.replanClockMs += dtMs;
    }
    trackStuck(prop, inFlight, routePending, stuckMoveThreshold) {
        if (inFlight || routePending) {
            this.navState.stuckFrames = 0;
            this.navState.lastX = prop.x;
            this.navState.lastY = prop.y;
        } else {
            const moved = Math.hypot(prop.x - (this.navState.lastX ?? prop.x), prop.y - (this.navState.lastY ?? prop.y));
            this.navState.lastX = prop.x;
            this.navState.lastY = prop.y;
            if (moved < stuckMoveThreshold) this.navState.stuckFrames += 1;
            else this.navState.stuckFrames = 0;
        }
    }
    static getPriority(reason, isVisible) {
        if (reason === "targetChange") return REPLAN_PRIORITY_TARGET;
        if (!isVisible) return REPLAN_PRIORITY_STUCK_OFFSCREEN;
        if (reason === "noPath" || reason === "stuck" || reason === "offPath") return REPLAN_PRIORITY_VISIBLE;
        return REPLAN_PRIORITY_NORMAL;
    }
    evaluate(prop, state, inFlight) {
        const nav = state.nav;
        const settings = nav.settings;
        const stuckFrames = this.navState.stuckFrames;
        const stuckReplanFrames = settings.stuckReplanFrames;
        const isVisible = state.viewport.circleInBounds(prop.x, prop.y, prop.radius, VIEW_TIER.PROPS);
        const canReplan = isVisible || stuckFrames > stuckReplanFrames;
        if (!inFlight && this.navState.topologyKey !== nav.topologyKey()) if (canReplan) return { shouldReplan: true, reason: "epoch", priority: PathReplanManager.getPriority("epoch", isVisible) };
        if (!inFlight) {
            let idleReason = null;
            if (!navHasPath(this.navState)) idleReason = "noPath";
            else if (stuckFrames > stuckReplanFrames) idleReason = "stuck";
            if (idleReason && canReplan) return { shouldReplan: true, reason: idleReason, priority: PathReplanManager.getPriority(idleReason, isVisible) };
        }
        return { shouldReplan: false };
    }
    evaluateOffPath(steering, prop, state) {
        if (steering && steering.offPath && this.replanClockMs - (this.navState.lastOffPathReplan || 0) >= REPLAN_OFF_PATH_COOLDOWN_MS) {
            const stuckFrames = this.navState.stuckFrames;
            const stuckReplanFrames = state.nav.settings.stuckReplanFrames;
            const isVisible = state.viewport.circleInBounds(prop.x, prop.y, prop.radius, VIEW_TIER.PROPS);
            const canReplan = isVisible || stuckFrames > stuckReplanFrames;
            const softReplanAllowed = stuckFrames > Math.max(1, Math.floor(stuckReplanFrames * 0.5));
            if (softReplanAllowed && canReplan) {
                this.navState.lastOffPathReplan = this.replanClockMs;
                return { shouldReplan: true, reason: "offPath", priority: PathReplanManager.getPriority("offPath", isVisible) };
            }
        }
        return { shouldReplan: false };
    }
}
// --- NavTopology.js ---
export function isNavWalkableAt(index, idx) {
    if (idx < 0 || idx >= index.flags.length) return false;
    return index.flags[idx] !== 0;
}
export function writeNavWalkableFlags(flags, cells) {
    flags.fill(0);
    for (let i = 0; i < cells.length; i++) flags[cells[i]] = 1;
}
export function createNavWalkableCandidateMask(grid, cells, reuse = null) {
    const size = grid.cols * grid.rows;
    const mask = reuse && reuse.length === size ? reuse : new Uint8Array(size);
    mask.fill(0);
    for (let i = 0; i < cells.length; i++) mask[cells[i]] = 1;
    return mask;
}
export function createNavWalkableReachedMask(grid, reuse = null) {
    const cols = grid.cols;
    const rows = grid.rows;
    const size = cols * rows;
    return reuse && reuse.length === size ? reuse : new Uint8Array(size);
}
export function isNavWalkableCell(grid, navTopology, idx) {
    const cols = grid.cols;
    const rows = grid.rows;
    if (idx < 0 || idx >= cols * rows) return false;
    if (grid.isBlockedIdx(idx)) return false;
    const col = idx % cols;
    const row = (idx / cols) | 0;
    for (let dir = 0; dir < OCTILE_DIR_COUNT; dir++) {
        const nCol = col + OCTILE_DCOL[dir];
        const nRow = row + OCTILE_DR[dir];
        if (nCol < 0 || nCol >= cols || nRow < 0 || nRow >= rows) continue;
        const nIdx = nRow * cols + nCol;
        if (canStepEitherDirection(grid, navTopology, idx, nIdx)) return true;
    }
    return false;
}
export function floodConnectedNavWalkableCells(grid, navTopology, candidates, candidateMask, seedCells, reachedMask) {
    reachedMask.fill(0);
    const queue = [];
    for (let i = 0; i < seedCells.length; i++) {
        const idx = seedCells[i];
        if (!candidateMask[idx] || reachedMask[idx]) continue;
        reachedMask[idx] = 1;
        queue.push(idx);
    }
    while (queue.length) {
        const idx = queue.pop();
        const col = idx % grid.cols;
        const row = (idx / grid.cols) | 0;
        for (let dir = 0; dir < OCTILE_DIR_COUNT; dir++) {
            const nCol = col + OCTILE_DCOL[dir];
            const nRow = row + OCTILE_DR[dir];
            if (nCol < 0 || nCol >= grid.cols || nRow < 0 || nRow >= grid.rows) continue;
            const nIdx = nRow * grid.cols + nCol;
            if (candidateMask[nIdx] && !reachedMask[nIdx] && canStepEitherDirection(grid, navTopology, idx, nIdx)) {
                reachedMask[nIdx] = 1;
                queue.push(nIdx);
            }
        }
    }
    const connected = [];
    for (let i = 0; i < candidates.length; i++) {
        const idx = candidates[i];
        if (reachedMask[idx]) connected.push(idx);
    }
    return connected;
}
export function filterWalkableCellsInBounds(cells, grid, boundsConfig) {
    return cells.filter((idx) => isIdxInMapGenBounds(boundsConfig, grid, idx));
}
export function getNavWalkableCellIndex(state, boundsConfig = state.editor.cavernConfig, floodSeedBounds = null) {
    const navCacheKey = navWalkableCacheKey(state);
    const cache = state.editor.navWalkableCellsCache;
    if (navWalkableCacheHit(cache, navCacheKey, boundsConfig, floodSeedBounds)) return cache;
    return bakeNavWalkableCellIndex(state, boundsConfig, floodSeedBounds);
}
export function isNavWalkableCellAt(state, idx, boundsConfig = state.editor.cavernConfig, floodSeedBounds = null) {
    const index = getNavWalkableCellIndex(state, boundsConfig, floodSeedBounds);
    return isNavWalkableAt(index, idx);
}
export function patchNavWalkableCellIndex(state, idx = null) {
    const cache = state.editor.navWalkableCellsCache;
    if (!cache?.boundsConfig) return null;
    if (idx === null || !cache.candidates) return bakeNavWalkableCellIndex(state, cache.boundsConfig, cache.floodSeedBounds);
    return patchNavWalkableCellIndexRegion(state, cache, idx);
}
export function pickWalkableCell(openCells, excludeIndices = null, rng = Math.random) {
    const candidates = excludeIndices ? openCells.filter((idx) => !excludeIndices.has(idx)) : openCells;
    if (!candidates.length) return null;
    return candidates[Math.floor(rng() * candidates.length)];
}
export function pickNavWalkableCell(state, rng = Math.random, boundsConfig = state.editor.cavernConfig, floodSeedBounds = null, excludeIndices = null, filterBoundsConfig = null) {
    let cells = getNavWalkableCellIndex(state, boundsConfig, floodSeedBounds).cells;
    if (filterBoundsConfig) cells = filterWalkableCellsInBounds(cells, state.obstacleGrid, filterBoundsConfig);
    return pickWalkableCell(cells, excludeIndices, rng);
}
export function findNearestOpenCellIdx(blocked, grid, idx) {
    const cols = grid.cols;
    const rows = grid.rows;
    if (blocked[idx] === 0) return idx;
    const c0 = idx % cols;
    const cellCount = cols * rows;
    for (let r = 1; r <= 5; r++)
        for (let dr = -r; dr <= r; dr++) {
            const nRowIdx = idx + dr * cols;
            if (nRowIdx < 0 || nRowIdx >= cellCount) continue;
            for (let dc = -r; dc <= r; dc++) {
                const nc = c0 + dc;
                if (nc >= 0 && nc < cols) {
                    const nIdx = nRowIdx + dc;
                    if (blocked[nIdx] === 0) return nIdx;
                }
            }
        }
    return idx;
}
export class NavTopology {
    /** @param {WorldObstacleGrid} grid @param {{ worker?: HpaPathWorker | null }} [options] */
    constructor(grid, { worker = null } = {}) {
        this.grid = grid;
        /** @type {HpaPathWorker | null} */
        this._worker = worker;
        /** @type {import("../Navigation/GridNavSnapshot.js").GridFrame | null} */
        this._frame = null;
        /** @type {import("../Navigation/navTopologySab.js").NavTopology | null} */
        this._topology = null;
        /** @type {"worker" | "local" | null} */
        this._source = worker ? "worker" : null;
    }
    /** @param {HpaPathWorker} worker */
    bindWorker(worker) {
        this._worker = worker;
        this._source = "worker";
    }
    /** @param {import("../Navigation/GridNavSnapshot.js").GridFrame} frame @param {import("../Navigation/navTopologySab.js").NavTopology} topology */
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
        const simView = createNavSimView(frame, arena.gridFill, arena.floorPacked, arena.edgeSlots, this.grid.cellEdgePool, arena.vertexPassability, arena.activePortalPairs, arena.activePortalCount);
        const topology = arena.topologyHandle;
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
        return { gridFill: arena.gridFill, floorPacked: arena.floorPacked, edgeSlots: arena.edgeSlots, edgePool: grid.cellEdgePool };
    }
    _localArena() {
        return localBakeArenas.get(this.grid) ?? null;
    }
}
export function invalidateGridLocalNavBake(grid) {
    localBakeArenas.delete(grid);
    if (grid._navTopologyRef?.invalidateLocalBake) grid._navTopologyRef.invalidateLocalBake();
}
export function bakeNavTopologyIntoArena(simView, topology, cardinalOpen, vertexPassability, idx = null) {
    const frame = simView.frame;
    const { cols, rows } = frame;
    // An edit changes canStep on BOTH cells of a shared (mirrored) edge, and octile/vertex
    // recompute reads a 1-cell neighborhood — so re-bake a 1-cell halo around the edit.
    const bakeBounds = idx === null ? null : haloEditBounds(idx, frame);
    if (bakeBounds)
        forEachDenseCellInBounds(frame, bakeBounds, (cellIdx) => {
            recomputeBlockedFromGridFill(simView.grid, topology.blocked, cellIdx);
        });
    else recomputeBlockedFromGridFill(simView.grid, topology.blocked, null);
    recomputeVertexPassabilityInto(simView, vertexPassability, bakeBounds);
    recomputeNavCardinalOpenInto(simView, cardinalOpen, vertexPassability, bakeBounds);
    buildOctileNeighborsFromTopologyBounds(topology.blocked, cardinalOpen, vertexPassability, cols, rows, topology.octileNeighbors, bakeBounds ?? cellBoundsForGrid(frame));
    if (topology.octilePredecessors) buildOctilePredecessorsFromForwardGrid(topology.octileNeighbors, topology.octilePredecessors, cols, rows, bakeBounds);
}
export function bakeNavTopologyLocal(grid, damageBounds = null) {
    const navTopology = NavTopology.bakeLocal(grid, damageBounds);
    return { frame: navTopology.frame, topology: navTopology.topology, simView: null, cardinalOpen: navTopology.navCardinalOpen, vertexPassability: navTopology.vertexPassability, navTopology };
}
export const OCTILE_DIRS_PER_CELL = 8;
export const OCTILE_NEIGHBOR_BYTES = OCTILE_DIRS_PER_CELL * 4;
export function octileNeighborBase(cellIdx) {
    return cellIdx * OCTILE_DIRS_PER_CELL;
}
export function octileNeighborOffset(cellIdx, dirIdx) {
    return cellIdx * OCTILE_DIRS_PER_CELL + dirIdx;
}
export function navTopologyFromSab(sabBlocked, sabOctileNeighbors, sabOctilePredecessors) {
    return { blocked: new Uint8Array(sabBlocked), octileNeighbors: new Int32Array(sabOctileNeighbors), octilePredecessors: new Int32Array(sabOctilePredecessors) };
}
export function createNavTopologySabArena(cellCount, vertCount, cols = 0, rows = 0) {
    const vertBytes = Math.max(vertCount, 4);
    const expCellCount = cols > 0 && rows > 0 ? (cols + 1) * (rows + 1) : cellCount;
    /** @type {NavTopologySabArena} */
    const arena = { cellCount, sabBlocked: new SharedArrayBuffer(cellCount), sabGridFill: new SharedArrayBuffer(cellCount), sabFloorPacked: new SharedArrayBuffer(cellCount), sabActivePortalPairs: new SharedArrayBuffer(512), sabActivePortalCount: new SharedArrayBuffer(4), sabEdgeSlots: new SharedArrayBuffer(expCellCount * CELL_EDGE_SLOT_BYTES), sabOctileNeighbors: new SharedArrayBuffer(cellCount * OCTILE_NEIGHBOR_BYTES), sabOctilePredecessors: new SharedArrayBuffer(cellCount * OCTILE_NEIGHBOR_BYTES), sabCardinalOpen: new SharedArrayBuffer(cellCount), sabVertexPassability: new SharedArrayBuffer(vertBytes), blocked: undefined, gridFill: undefined, floorPacked: undefined, activePortalPairs: undefined, activePortalCount: undefined, edgeSlots: undefined, octileNeighbors: undefined, octilePredecessors: undefined, cardinalOpen: undefined, vertexPassability: undefined, topologyHandle: undefined };
    bindNavTopologySabViews(arena);
    return arena;
}
export function bindNavTopologySabViews(arena) {
    arena.blocked = new Uint8Array(arena.sabBlocked);
    arena.gridFill = new Uint8Array(arena.sabGridFill);
    arena.floorPacked = new Uint8Array(arena.sabFloorPacked);
    arena.activePortalPairs = new Int32Array(arena.sabActivePortalPairs);
    arena.activePortalCount = new Int32Array(arena.sabActivePortalCount);
    arena.edgeSlots = new Int32Array(arena.sabEdgeSlots);
    arena.octileNeighbors = new Int32Array(arena.sabOctileNeighbors);
    arena.octilePredecessors = new Int32Array(arena.sabOctilePredecessors);
    arena.cardinalOpen = new Uint8Array(arena.sabCardinalOpen);
    arena.vertexPassability = new Uint8Array(arena.sabVertexPassability);
    if (!arena.topologyHandle) arena.topologyHandle = { blocked: arena.blocked, octileNeighbors: arena.octileNeighbors };
    else {
        arena.topologyHandle.blocked = arena.blocked;
        arena.topologyHandle.octileNeighbors = arena.octileNeighbors;
    }
}
export function growNavTopologyVertexSab(arena, vertCount) {
    const vertBytes = Math.max(vertCount, 4);
    if (arena.sabVertexPassability.byteLength >= vertBytes) return;
    arena.sabVertexPassability = new SharedArrayBuffer(vertBytes);
    arena.vertexPassability = new Uint8Array(arena.sabVertexPassability);
}
export function growNavTopologyActivePortalSab(arena, pairSlots) {
    const needBytes = Math.max(pairSlots * 4, 8);
    if (arena.sabActivePortalPairs.byteLength >= needBytes) return;
    const grown = new SharedArrayBuffer(Math.max(needBytes, arena.sabActivePortalPairs.byteLength * 2));
    new Int32Array(grown).set(arena.activePortalPairs);
    arena.sabActivePortalPairs = grown;
    arena.activePortalPairs = new Int32Array(arena.sabActivePortalPairs);
}
export function packNavTopologyFromGrid(grid, arena, idx = null) {
    const pairSlots = grid.activePortalCount * 2;
    growNavTopologyActivePortalSab(arena, pairSlots);
    arena.activePortalPairs.fill(0);
    if (pairSlots > 0) arena.activePortalPairs.set(grid.activePortalPairs.subarray(0, pairSlots));
    arena.activePortalCount[0] = grid.activePortalCount;
    if (idx === null) {
        arena.gridFill.set(grid.grid);
        arena.floorPacked.set(grid.floorPacked);
        arena.edgeSlots.set(grid.cellEdgeSlots);
        return;
    }
    // Copy a 1-cell halo: a mirrored edge write updates edge slots on the neighbor cell too.
    forEachDenseCellInBounds(grid, haloEditBounds(idx, grid), (cellIdx) => {
        arena.gridFill[cellIdx] = grid.grid[cellIdx];
        arena.floorPacked[cellIdx] = grid.floorPacked[cellIdx];
        for (let side = 0; side < 4; side++) {
            const offset = cellEdgeSlotOffset(cellIdx, side);
            arena.edgeSlots[offset] = grid.cellEdgeSlots[offset];
        }
    });
}
export function recomputeBlockedFromGridFill(gridFill, blocked, idx = null) {
    if (idx === null) {
        for (let i = 0; i < gridFill.length; i++) blocked[i] = gridFill[i] !== 0 ? 1 : 0;
        return;
    }
    blocked[idx] = gridFill[idx] !== 0 ? 1 : 0;
}
export function buildOctileNeighborsFromTopologyBounds(blocked, cardinalOpen, vertexPassability, cols, rows, octileNeighbors, bounds) {
    const grid = { cols, rows };
    forEachDenseCellInBounds(grid, bounds, (idx) => {
        const col = idx % cols;
        const row = (idx / cols) | 0;
        const base = octileNeighborBase(idx);
        if (blocked[idx]) {
            for (let i = 0; i < OCTILE_DIR_COUNT; i++) octileNeighbors[base + i] = -1;
            return;
        }
        for (let i = 0; i < OCTILE_DIR_COUNT; i++) {
            const dc = OCTILE_DCOL[i];
            const dr = OCTILE_DR[i];
            const nc = col + dc;
            const nr = row + dr;
            if (nc < 0 || nc >= cols || nr < 0 || nr >= rows) {
                octileNeighbors[octileNeighborOffset(idx, i)] = -1;
                continue;
            }
            const nIdx = nr * cols + nc;
            if (!cellInRect(nIdx, grid)) {
                octileNeighbors[octileNeighborOffset(idx, i)] = -1;
                continue;
            }
            if (blocked[nIdx]) {
                octileNeighbors[octileNeighborOffset(idx, i)] = -1;
                continue;
            }
            const open = dc === 0 || dr === 0 ? (cardinalOpen[idx] & getCardinalBit(dc, dr)) !== 0 : diagonalStepOpen(cardinalOpen, vertexPassability, grid, idx, dc, dr);
            octileNeighbors[octileNeighborOffset(idx, i)] = open ? nIdx : -1;
        }
    });
}
export function buildOctilePredecessorsFromForwardGrid(octileNeighbors, octilePredecessors, cols, rows, targetBounds = null) {
    const cellCount = cols * rows;
    const grid = { cols, rows };
    if (!targetBounds) octilePredecessors.fill(-1);
    else
        forEachDenseCellInRect(grid, targetBounds.startCol, targetBounds.endCol, targetBounds.startRow, targetBounds.endRow, (idx) => {
            const base = octileNeighborBase(idx);
            for (let i = 0; i < OCTILE_DIRS_PER_CELL; i++) octilePredecessors[base + i] = -1;
        });
    for (let idx = 0; idx < cellCount; idx++) {
        const base = octileNeighborBase(idx);
        for (let i = 0; i < OCTILE_DIRS_PER_CELL; i++) {
            const nIdx = octileNeighbors[base + i];
            if (nIdx < 0) continue;
            if (targetBounds) {
                const col = nIdx % cols;
                const row = (nIdx / cols) | 0;
                if (col < targetBounds.startCol || col > targetBounds.endCol || row < targetBounds.startRow || row > targetBounds.endRow) continue;
            }
            octilePredecessors[octileNeighborOffset(nIdx, OCTILE_REVERSE_DIR[i])] = idx;
        }
    }
}
export function navCanStep(frame, topology, fromIdx, toIdx) {
    if (fromIdx < 0 || toIdx < 0) return false;
    const { cols, rows } = frame;
    const cellCount = cols * rows;
    if (fromIdx >= cellCount || toIdx >= cellCount) return false;
    if (topology.blocked[fromIdx]) return false;
    for (let dirIdx = 0; dirIdx < 8; dirIdx++) if (topology.octileNeighbors[octileNeighborOffset(fromIdx, dirIdx)] === toIdx) return true;
    return false;
}
export function navHasPath(navState) {
    return navState.pathLen > 0 && navState.pathSlot >= 0;
}
export const OCTILE_NEIGHBOR_GRID_LAYOUT = Object.freeze({
    directionCount: OCTILE_DIRS_PER_CELL,
    bytesPerCell: OCTILE_NEIGHBOR_BYTES,
    bufferByteLength(cellCount) {
        return cellCount * this.bytesPerCell;
    },
    cellBase(cellIdx) {
        return octileNeighborBase(cellIdx);
    },
    cellOffset(cellIdx, dirIdx) {
        return octileNeighborOffset(cellIdx, dirIdx);
    },
    clearCell(neighborGrid, cellIdx) {
        const base = this.cellBase(cellIdx);
        for (let dir = 0; dir < this.directionCount; dir++) neighborGrid[base + dir] = -1;
    },
});
export const REGION_CELL_UNASSIGNED = -1;
export function buildNavComponentMap(blocked, octileNeighbors, cols, rows, activePortalPairs = null, activePortalCount = null) {
    const size = cols * rows;
    const cellToComponent = new Int16Array(size);
    cellToComponent.fill(REGION_CELL_UNASSIGNED);
    let componentId = 0;
    const portalCount = activePortalPairCount(activePortalCount);
    for (let start = 0; start < size; start++) {
        if (blocked[start] || cellToComponent[start] >= 0) continue;
        const id = componentId++;
        bfsIndices([start], (idx, enqueue) => {
            if (blocked[idx] || cellToComponent[idx] >= 0) return;
            cellToComponent[idx] = id;
            forEachNavWalkNeighbor(idx, blocked, octileNeighbors, activePortalPairs, portalCount, (nIdx) => {
                if (cellToComponent[nIdx] < 0) enqueue(nIdx);
            });
        });
    }
    return cellToComponent;
}
export class HpaReplanRequest {
    constructor({ obstacleGrid, startX, startY, targetX, targetY, graphEpoch, topologyKey, navTopology, state = null }) {
        this.obstacleGrid = obstacleGrid;
        this.startX = startX;
        this.startY = startY;
        this.targetX = targetX;
        this.targetY = targetY;
        this.graphEpoch = graphEpoch;
        this.topologyKey = topologyKey;
        this.navTopology = navTopology;
        this.state = state;
    }
    toWorkerPayload() {
        const { startIdx, targetIdx } = replanCellIndicesFromWorldCoords(this.obstacleGrid, this.startX, this.startY, this.targetX, this.targetY);
        globalReplanPayload.startIdx = startIdx;
        globalReplanPayload.targetIdx = targetIdx;
        return globalReplanPayload;
    }
    applyResult(navState, worker, result) {
        navState.topologyKey = this.topologyKey;
        if (!result || !result.pathLen) {
            worker.releaseOwnedPathSlot(navState);
            if (this.state && (navState.pendingReplanReason === "targetChange" || navState.pendingReplanReason === "targetMoved")) logHpaReplanFailure(this.obstacleGrid, worker, this.navTopology, this.startX, this.startY, this.targetX, this.targetY);
            return;
        }
        worker.releaseOwnedPathSlot(navState);
        navState.pathSlot = result.pathSlot;
        navState.pathLen = result.pathLen;
        navState.pathProgressIdx = findSabPathProgressIdx(this.startX, this.startY, worker, result.pathSlot, result.pathLen, this.obstacleGrid, this.navTopology);
        navState.routeId += 1;
        navState.lastAcceptedRouteReason = navState.pendingReplanReason;
        navState.lastAcceptedPathLen = result.pathLen;
        navState.lastAcceptedProgressIdx = navState.pathProgressIdx;
        navState.lastAcceptedTargetX = this.targetX;
        navState.lastAcceptedTargetY = this.targetY;
        navState.pendingReplanReason = null;
        navState.lastTargetX = this.targetX;
        navState.lastTargetY = this.targetY;
    }
}
export const HPA_REPLAN_FRAME_START_BUDGET = 12;
export const HPA_REPLAN_PEAK_INFLIGHT_CAP = 16;
export class HpaPathSession {
    constructor(hpaPathWorker, { frameStartBudget = HPA_REPLAN_FRAME_START_BUDGET, peakInflightCap = HPA_REPLAN_PEAK_INFLIGHT_CAP } = {}) {
        this.worker = hpaPathWorker;
        this._frameStartBudget = frameStartBudget;
        this._peakInflightCap = Math.min(peakInflightCap, MAX_HPA_REPLAN_SLOTS);
        this._nextRequestId = 1;
        this._pendingRequests = new WeakMap();
        this._replanPriority = new WeakMap();
        this._lastReplanFrame = new WeakMap();
        this._draining = new WeakSet();
        this._queuedNavStates = new WeakSet();
        this._waitQueue = [];
        this._activeWorkerCount = 0;
        this._slotWaiters = [];
        this._frameId = 0;
        this._frameStartsUsed = 0;
        this._peakInflightSeen = 0;
    }
    isReplanInFlight(navState) {
        return navState.hpaReplanRequestId !== 0;
    }
    getInflightCount() {
        return this._activeWorkerCount;
    }
    getPeakInflightReplans() {
        return this._peakInflightSeen;
    }
    resetPeakInflightReplans() {
        this._peakInflightSeen = 0;
    }
    beginFrame(frameId) {
        if (frameId != null && frameId === this._frameId) return;
        this._frameId = frameId ?? this._frameId + 1;
        this._frameStartsUsed = 0;
    }
    flushFrame() {
        this._pumpQueue();
    }
    requestReplan(navState, request, priority = 0) {
        const lastFrame = this._lastReplanFrame.get(navState) ?? -9999;
        if (this._frameId - lastFrame < 15) return false;
        this._lastReplanFrame.set(navState, this._frameId);
        this._pendingRequests.set(navState, request);
        this._replanPriority.set(navState, priority);
        navState.hpaReplanRequestId = this._nextRequestId++;
        if (this._draining.has(navState)) return true;
        this._enqueue(navState);
        return true;
    }
    _canStartDrain() {
        return this._activeWorkerCount < this._peakInflightCap && this._frameStartsUsed < this._frameStartBudget;
    }
    _startDrain(navState) {
        if (this._draining.has(navState) || navState.hpaReplanRequestId === 0) return false;
        this._frameStartsUsed++;
        this._draining.add(navState);
        void this._drainReplan(navState);
        return true;
    }
    _enqueue(navState) {
        if (this._queuedNavStates.has(navState)) {
            this._resortQueued(navState);
            return;
        }
        this._queuedNavStates.add(navState);
        this._waitQueue.push(navState);
        this._sortWaitQueue();
    }
    _resortQueued(navState) {
        const idx = this._waitQueue.indexOf(navState);
        if (idx >= 0) this._waitQueue.splice(idx, 1);
        this._waitQueue.push(navState);
        this._sortWaitQueue();
    }
    _sortWaitQueue() {
        this._waitQueue.sort((a, b) => (this._replanPriority.get(b) ?? 0) - (this._replanPriority.get(a) ?? 0));
    }
    _pumpQueue() {
        while (this._waitQueue.length > 0 && this._canStartDrain()) {
            const navState = this._waitQueue.shift();
            this._queuedNavStates.delete(navState);
            if (navState.hpaReplanRequestId === 0 || this._draining.has(navState)) continue;
            this._startDrain(navState);
        }
    }
    _recordInflightPeak() {
        if (this._activeWorkerCount > this._peakInflightSeen) this._peakInflightSeen = this._activeWorkerCount;
    }
    _releaseWorkerSlot() {
        this._activeWorkerCount--;
        while (this._slotWaiters.length) this._slotWaiters.shift()();
        this._pumpQueue();
    }
    async _awaitWorkerSlot() {
        while (this._activeWorkerCount >= this._peakInflightCap)
            await new Promise((resolve) => {
                this._slotWaiters.push(resolve);
            });
    }
    async _drainReplan(navState) {
        try {
            while (navState.hpaReplanRequestId !== 0) {
                await this._awaitWorkerSlot();
                if (navState.hpaReplanRequestId === 0) break;
                const requestId = navState.hpaReplanRequestId;
                const request = this._pendingRequests.get(navState);
                this._activeWorkerCount++;
                this._recordInflightPeak();
                let workerOut = null;
                try {
                    workerOut = await this.worker.requestPath(request, navState);
                } catch (err) {
                    console.error("HPA replan failed", err);
                    if (navState.hpaReplanRequestId === requestId) navState.hpaReplanRequestId = 0;
                    break;
                } finally {
                    this._releaseWorkerSlot();
                }
                if (navState.hpaReplanRequestId !== requestId) {
                    if (workerOut?.result?.pathSlot >= 0) this.worker.releaseSlot(workerOut.result.pathSlot);
                    continue;
                }
                navState.hpaReplanRequestId = 0;
                if (!workerOut?.result) {
                    this.worker.releaseOwnedPathSlot(navState);
                    request.applyResult(navState, this.worker, null);
                } else request.applyResult(navState, this.worker, workerOut.result);
            }
        } finally {
            this._draining.delete(navState);
            if (navState.hpaReplanRequestId !== 0) this._enqueue(navState);
        }
    }
}
export class HpaNavSession {
    constructor() {
        this.navState = createNavState();
        this.replanClockMs = 0;
        this.pendingTargetReplan = false;
        this.committedPathSlot = -1;
        this.committedPathLen = 0;
        this.routeCommitFrames = 0;
    }
    reset(state) {
        this.pendingTargetReplan = false;
        this.committedPathSlot = -1;
        this.committedPathLen = 0;
        this.routeCommitFrames = 0;
        const nav = state.nav;
        nav.worker.releaseOwnedPathSlot(this.navState);
        Object.assign(this.navState, createNavState());
        this.replanClockMs = 0;
    }
    markTargetChanged() {
        this.pendingTargetReplan = true;
    }
    isRoutePending() {
        return this.pendingTargetReplan || this.navState.hpaReplanRequestId !== 0;
    }
    replan(prop, targetX, targetY, state, priority = REPLAN_PRIORITY_TARGET) {
        const nav = state.nav;
        return nav.session.requestReplan(this.navState, buildReplanParams(state.obstacleGrid, prop.x, prop.y, targetX, targetY, nav, state), priority);
    }
    requestReplan(prop, targetX, targetY, state, priority, reason) {
        const accepted = this.replan(prop, targetX, targetY, state, priority);
        if (accepted) {
            this.pendingTargetReplan = false;
            this.navState.pendingReplanReason = reason;
            this.navState.stuckFrames = 0;
            return { steering: null, replanReason: reason };
        }
        return { steering: null, replanReason: "cooldown" };
    }
    syncRouteCommitState() {
        if (!navHasPath(this.navState)) {
            this.committedPathSlot = -1;
            this.committedPathLen = 0;
            this.routeCommitFrames = 0;
            return;
        }
        if (this.navState.pathSlot !== this.committedPathSlot || this.navState.pathLen !== this.committedPathLen) {
            this.committedPathSlot = this.navState.pathSlot;
            this.committedPathLen = this.navState.pathLen;
            this.routeCommitFrames = 0;
            return;
        }
        this.routeCommitFrames++;
    }
    softReplanAllowed(stuckFrames, stuckReplanFrames) {
        return stuckFrames > Math.max(1, Math.floor(stuckReplanFrames * 0.5));
    }
    update(prop, targetX, targetY, state, dtMs, pathSettings, sandboxReplan) {
        if (!this.replanManager) this.replanManager = new PathReplanManager(this.navState);
        this.replanManager.updateClock(dtMs);
        const nav = state.nav;
        const inFlight = nav.session.isReplanInFlight(this.navState);
        const routePending = this.pendingTargetReplan || this.navState.hpaReplanRequestId !== 0;
        this.replanManager.trackStuck(prop, inFlight, routePending, nav.settings.stuckMoveThreshold);
        this.syncRouteCommitState();
        const replanDecision = this.replanManager.evaluate(prop, state, inFlight);
        if (replanDecision.shouldReplan) return this.requestReplan(prop, targetX, targetY, state, replanDecision.priority, replanDecision.reason);
        if (sandboxReplan) {
            const sandboxResult = sandboxReplan(this, prop, targetX, targetY, state, { inFlight, isVisible: state.viewport.circleInBounds(prop.x, prop.y, prop.radius, VIEW_TIER.PROPS), stuckFrames: this.navState.stuckFrames, stuckReplanFrames: nav.settings.stuckReplanFrames });
            if (sandboxResult) return sandboxResult;
        }
        if (!navHasPath(this.navState)) return { steering: null, replanReason: routePending ? "pending" : "noPath" };
        const offPath = computeSabPathSteering(ENGINE_F32, N_OUT_STEER, agentPose(prop), nav.worker, this.navState.pathSlot, this.navState.pathLen, targetX, targetY, state.obstacleGrid, nav.topology, pathSettings, this.navState);
        SCRATCH_PATH_STEERING.desiredX = ENGINE_F32[N_OUT_STEER];
        SCRATCH_PATH_STEERING.desiredY = ENGINE_F32[N_OUT_STEER + 1];
        SCRATCH_PATH_STEERING.desiredSpeed = ENGINE_F32[N_OUT_STEER + 2];
        SCRATCH_PATH_STEERING.offPath = offPath;
        const offPathDecision = this.replanManager.evaluateOffPath(SCRATCH_PATH_STEERING, prop, state);
        if (offPathDecision.shouldReplan) return this.requestReplan(prop, targetX, targetY, state, offPathDecision.priority, offPathDecision.reason);
        return { steering: SCRATCH_PATH_STEERING, replanReason: null };
    }
    getCommitStatus() {
        return { routeCommitFrames: this.routeCommitFrames };
    }
}
