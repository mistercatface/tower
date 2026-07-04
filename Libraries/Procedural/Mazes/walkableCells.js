import { gridNavCacheKey, isNavTopologyReady } from "../../Spatial/grid/gridNavEpoch.js";
import { cellInRect } from "../../Spatial/grid/GridUtils.js";
import { isIdxInMapGenBounds } from "../../Sandbox/mapGenBounds.js";
import { padCellIdxToGrid, padCellBoundsToGrid, forEachDenseCellInRect } from "../../DataStructures/CellRect.js";
import { forEachCardinalNeighborIdx } from "../../Spatial/grid/GridUtils.js";
/** @typedef {{ flags: Uint8Array, cols: number, rows: number }} NavWalkableIndex */
export function isNavWalkableAt(index, idx) {
    if (idx < 0 || idx >= index.flags.length) return false;
    return index.flags[idx] !== 0;
}
export function countNavWalkableFlags(flags) {
    let count = 0;
    for (let i = 0; i < flags.length; i++) if (flags[i]) count++;
    return count;
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
export function createNavWalkableReachedMask(cols, rows, reuse = null) {
    const size = cols * rows;
    return reuse && reuse.length === size ? reuse : new Uint8Array(size);
}
export function canStepEitherDirection(grid, navTopology, idx, nIdx) {
    return grid.canStep(idx, nIdx, navTopology) || grid.canStep(nIdx, idx, navTopology);
}
export function isNavWalkableCell(grid, navTopology, idx) {
    const cols = grid.cols;
    const rows = grid.rows;
    if (idx < 0 || idx >= cols * rows) return false;
    if (grid.isBlockedIdx(idx)) return false;
    let walkable = false;
    forEachCardinalNeighborIdx(idx, cols, rows, (nIdx) => {
        if (walkable) return;
        if (canStepEitherDirection(grid, navTopology, idx, nIdx)) walkable = true;
    });
    return walkable;
}
export function floodConnectedNavWalkableCells(grid, navTopology, candidates, candidateMask, cols, rows, seedCells, reachedMask) {
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
        forEachCardinalNeighborIdx(idx, cols, rows, (nIdx) => {
            if (candidateMask[nIdx] && !reachedMask[nIdx])
                if (canStepEitherDirection(grid, navTopology, idx, nIdx)) {
                    reachedMask[nIdx] = 1;
                    queue.push(nIdx);
                }
        });
    }
    const connected = [];
    for (let i = 0; i < candidates.length; i++) {
        const idx = candidates[i];
        if (reachedMask[idx]) connected.push(idx);
    }
    return connected;
}
function navWalkableCacheKey(state) {
    const grid = state.obstacleGrid;
    const worker = state.nav?.worker;
    const key = gridNavCacheKey(grid);
    if (!worker || !isNavTopologyReady(worker, grid)) return `${key}:pending`;
    return key;
}
export function filterWalkableCellsInBounds(cells, grid, boundsConfig) {
    return cells.filter((idx) => isIdxInMapGenBounds(boundsConfig, grid, idx));
}
export function collectWalkableCells(state, boundsConfig = state.editor.cavernConfig) {
    const grid = state.obstacleGrid;
    const epoch = gridNavCacheKey(grid);
    const cache = state.sandbox._walkableCellsCache;
    if (cache && cache.epoch === epoch && cache.boundsConfig === boundsConfig) return cache.cells;
    const open = [];
    const size = grid.cols * grid.rows;
    for (let idx = 0; idx < size; idx++) {
        if (grid.isBlockedIdx(idx)) continue;
        if (isIdxInMapGenBounds(boundsConfig, grid, idx)) open.push(idx);
    }
    state.sandbox._walkableCellsCache = { epoch, boundsConfig, cells: open };
    return open;
}
function updateNavWalkableCandidatesInPatch(state, cache, patchBounds) {
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
    forEachDenseCellInRect(patchBounds.startCol, patchBounds.endCol, patchBounds.startRow, patchBounds.endRow, cols, (idx) => {
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
function writeNavWalkableFlagsInRect(flags, cols, cells, patchBounds) {
    forEachDenseCellInRect(patchBounds.startCol, patchBounds.endCol, patchBounds.startRow, patchBounds.endRow, cols, (idx) => {
        flags[idx] = 0;
    });
    for (let i = 0; i < cells.length; i++) flags[cells[i]] = 1;
}
function patchNavWalkableCellIndexRegion(state, cache, idx) {
    const grid = state.obstacleGrid;
    const navTopology = state.nav.topology;
    const cols = grid.cols;
    const patchBounds = typeof idx === "object" && idx !== null ? padCellBoundsToGrid(idx, cols, grid.rows, 2) : padCellIdxToGrid(idx, cols, grid.rows, 2);
    ensureNavWalkableBuffers(cache, grid);
    updateNavWalkableCandidatesInPatch(state, cache, patchBounds);
    let seedCells = cache.floodSeedBounds ? filterWalkableCellsInBounds(cache.candidates, grid, cache.floodSeedBounds) : cache.candidates;
    if (!seedCells.length) seedCells = cache.candidates;
    const reachedMask = createNavWalkableReachedMask(grid.cols, grid.rows, cache.reachedMask);
    const connected = cache.candidates.length ? floodConnectedNavWalkableCells(grid, navTopology, cache.candidates, cache.candidateMask, grid.cols, grid.rows, seedCells, reachedMask) : [];
    writeNavWalkableFlagsInRect(cache.flags, grid.cols, connected, patchBounds);
    cache.cells = connected;
    cache.reachedMask = reachedMask;
    cache.navCacheKey = navWalkableCacheKey(state);
    return cache;
}
function ensureNavWalkableBuffers(cache, grid) {
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
function bakeNavWalkableCellIndex(state, boundsConfig, floodSeedBounds = null) {
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
    const prior = state.sandbox._navWalkableCellsCache;
    const cache = ensureNavWalkableBuffers(
        { navCacheKey, boundsConfig, floodSeedBounds, cells: [], flags: prior?.flags, candidateMask: prior?.candidateMask, reachedMask: prior?.reachedMask, cols: prior?.cols, rows: prior?.rows },
        grid,
    );
    const candidateMask = createNavWalkableCandidateMask(grid, candidates, cache.candidateMask);
    const reachedMask = createNavWalkableReachedMask(grid.cols, grid.rows, cache.reachedMask);
    const cells = candidates.length ? floodConnectedNavWalkableCells(grid, navTopology, candidates, candidateMask, grid.cols, grid.rows, seedCells, reachedMask) : [];
    writeNavWalkableFlags(cache.flags, cells);
    cache.cells = cells;
    cache.candidates = candidates;
    cache.candidateMask = candidateMask;
    cache.reachedMask = reachedMask;
    state.sandbox._navWalkableCellsCache = cache;
    return cache;
}
function navWalkableCacheHit(cache, navCacheKey, boundsConfig, floodSeedBounds) {
    return cache && navCacheKey && cache.navCacheKey === navCacheKey && cache.boundsConfig === boundsConfig && cache.floodSeedBounds === floodSeedBounds;
}
export function collectNavWalkableCells(state, boundsConfig = state.editor.cavernConfig, floodSeedBounds = null) {
    const navCacheKey = navWalkableCacheKey(state);
    const cache = state.sandbox._navWalkableCellsCache;
    if (navWalkableCacheHit(cache, navCacheKey, boundsConfig, floodSeedBounds)) return cache.cells;
    return bakeNavWalkableCellIndex(state, boundsConfig, floodSeedBounds).cells;
}
export function getNavWalkableCellIndex(state, boundsConfig = state.editor.cavernConfig, floodSeedBounds = null) {
    const navCacheKey = navWalkableCacheKey(state);
    const cache = state.sandbox._navWalkableCellsCache;
    if (navWalkableCacheHit(cache, navCacheKey, boundsConfig, floodSeedBounds)) return cache;
    return bakeNavWalkableCellIndex(state, boundsConfig, floodSeedBounds);
}
export function getNavWalkableCells(state, boundsConfig = state.editor.cavernConfig, floodSeedBounds = null) {
    return getNavWalkableCellIndex(state, boundsConfig, floodSeedBounds).cells;
}
export function isNavWalkableCellAtIndex(navWalkableIndex, idx) {
    return isNavWalkableAt(navWalkableIndex, idx);
}
export function isNavWalkableCellAt(state, idx, boundsConfig = state.editor.cavernConfig, floodSeedBounds = null) {
    const index = getNavWalkableCellIndex(state, boundsConfig, floodSeedBounds);
    return isNavWalkableAt(index, idx);
}
export function patchNavWalkableCellIndex(state, idx = null) {
    const cache = state.sandbox._navWalkableCellsCache;
    if (!cache?.boundsConfig) return null;
    if (idx === null || !cache.candidates) return bakeNavWalkableCellIndex(state, cache.boundsConfig, cache.floodSeedBounds);
    return patchNavWalkableCellIndexRegion(state, cache, idx);
}
export function pickWalkableCell(openCells, cols, excludeIndices = null, rng = Math.random) {
    const candidates = excludeIndices ? openCells.filter((idx) => !excludeIndices.has(idx)) : openCells;
    if (!candidates.length) return null;
    return candidates[Math.floor(rng() * candidates.length)];
}
export function pickNavWalkableCell(state, rng = Math.random, boundsConfig = state.editor.cavernConfig, floodSeedBounds = null, excludeIndices = null, filterBoundsConfig = null) {
    let cells = getNavWalkableCells(state, boundsConfig, floodSeedBounds);
    if (filterBoundsConfig) cells = filterWalkableCellsInBounds(cells, state.obstacleGrid, filterBoundsConfig);
    return pickWalkableCell(cells, state.obstacleGrid.cols, excludeIndices, rng);
}
export function createNavWalkableAccess(state, boundsConfig, floodSeedBounds = null) {
    let live = null;
    const isLive = () => {
        if (!live) return false;
        const navCacheKey = navWalkableCacheKey(state);
        return navWalkableCacheHit(live, navCacheKey, boundsConfig, floodSeedBounds);
    };
    const ensure = () => {
        if (!isLive()) live = getNavWalkableCellIndex(state, boundsConfig, floodSeedBounds);
        return live;
    };
    return {
        rebake() {
            live = bakeNavWalkableCellIndex(state, boundsConfig, floodSeedBounds);
            return live.cells;
        },
        cells() {
            return ensure().cells;
        },
        has(idx) {
            const index = ensure();
            return isNavWalkableAt(index, idx);
        },
        pick(rng = Math.random, excludeIndices = null, filterBoundsConfig = null) {
            return pickNavWalkableCell(state, rng, boundsConfig, floodSeedBounds, excludeIndices, filterBoundsConfig);
        },
        filterInBounds(filterBoundsConfig) {
            return filterWalkableCellsInBounds(this.cells(), state.obstacleGrid, filterBoundsConfig);
        },
    };
}
export function pickRandomWalkableCell(state, boundsConfig = state.editor.cavernConfig, excludeIndices = null, rng = Math.random) {
    const openCells = collectWalkableCells(state, boundsConfig);
    return pickWalkableCell(openCells, state.obstacleGrid.cols, excludeIndices, rng);
}
