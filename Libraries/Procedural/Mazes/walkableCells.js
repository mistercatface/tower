import { gridNavCacheKey, isNavTopologyReady } from "../../Spatial/grid/gridNavEpoch.js";
import { cellInRect, colRowToIndex } from "../../Spatial/grid/GridUtils.js";
import { floodConnectedNavWalkableCells, isNavWalkableCell } from "../../Spatial/grid/navWalkableCell.js";
import { forEachGlobalCellInMapGenBounds, isGlobalCellInMapGenBounds } from "../../Sandbox/mapGenBounds.js";
import { expandNavTopologyBakeBounds } from "../../Pathfinding/navTopologySab.js";
import { clampCellBoundsToGrid, forEachDenseCellInRect, padCellIdxToGrid } from "../../DataStructures/CellRect.js";
import { createNavWalkableCandidateMask, createNavWalkableReachedMask, isNavWalkableAt, writeNavWalkableFlags } from "./navWalkableIndex.js";
/** @typedef {import("./navWalkableIndex.js").NavWalkableIndex} NavWalkableIndex */
function cellIndex(col, row, cols) {
    return colRowToIndex(col, row, cols);
}
function navWalkableCacheKey(state) {
    const grid = state.obstacleGrid;
    const worker = state.nav?.worker;
    const key = gridNavCacheKey(grid);
    if (!worker || !isNavTopologyReady(worker, grid)) return `${key}:pending`;
    return key;
}
function globalCellForGridCell(grid, col, row) {
    const cellSize = grid.cellSize;
    const x = grid.gridCenterX(col);
    const y = grid.gridCenterY(row);
    return { globalCol: Math.round(x / cellSize), globalRow: Math.round(y / cellSize) };
}
export function filterWalkableCellsInBounds(cells, grid, boundsConfig) {
    const filtered = [];
    for (let i = 0; i < cells.length; i++) {
        const cell = cells[i];
        const { globalCol, globalRow } = globalCellForGridCell(grid, cell.col, cell.row);
        if (isGlobalCellInMapGenBounds(boundsConfig, globalCol, globalRow)) filtered.push(cell);
    }
    return filtered;
}
export function collectWalkableCells(state, boundsConfig = state.editor.cavernConfig) {
    const grid = state.obstacleGrid;
    const epoch = gridNavCacheKey(grid);
    const cache = state.sandbox._walkableCellsCache;
    if (cache && cache.epoch === epoch && cache.boundsConfig === boundsConfig) return cache.cells;
    const cellSize = grid.cellSize;
    const open = [];
    forEachGlobalCellInMapGenBounds(boundsConfig, (globalCol, globalRow) => {
        const col = grid.worldCol(globalCol * cellSize);
        const row = grid.worldRow(globalRow * cellSize);
        if (!cellInRect(col, row, grid.cols, grid.rows)) return;
        if (grid.isBlocked(col, row)) return;
        open.push({ col, row });
    });
    state.sandbox._walkableCellsCache = { epoch, boundsConfig, cells: open };
    return open;
}
function updateNavWalkableCandidatesInPatch(state, cache, patchBounds) {
    const grid = state.obstacleGrid;
    const navTopology = state.nav.topology;
    const boundsConfig = cache.boundsConfig;
    const { cols } = grid;
    cache.candidates = cache.candidates.filter((cell) => {
        if (cell.col < patchBounds.startCol || cell.col > patchBounds.endCol || cell.row < patchBounds.startRow || cell.row > patchBounds.endRow) return true;
        const idx = cell.col + cell.row * cols;
        const walkable = isNavWalkableCell(grid, navTopology, idx);
        cache.candidateMask[idx] = walkable ? 1 : 0;
        return walkable;
    });
    const seen = new Set(cache.candidates.map((cell) => cell.col + cell.row * cols));
    forEachDenseCellInRect(patchBounds.startCol, patchBounds.endCol, patchBounds.startRow, patchBounds.endRow, cols, (col, row) => {
        const { globalCol, globalRow } = globalCellForGridCell(grid, col, row);
        const idx = col + row * cols;
        if (!isGlobalCellInMapGenBounds(boundsConfig, globalCol, globalRow)) {
            cache.candidateMask[idx] = 0;
            return;
        }
        if (seen.has(idx)) return;
        if (!isNavWalkableCell(grid, navTopology, idx)) {
            cache.candidateMask[idx] = 0;
            return;
        }
        cache.candidateMask[idx] = 1;
        cache.candidates.push({ col, row });
        seen.add(idx);
    });
}
function writeNavWalkableFlagsInRect(flags, cols, cells, patchBounds) {
    forEachDenseCellInRect(patchBounds.startCol, patchBounds.endCol, patchBounds.startRow, patchBounds.endRow, cols, (_col, _row, idx) => {
        flags[idx] = 0;
    });
    for (let i = 0; i < cells.length; i++) {
        const { col, row } = cells[i];
        flags[colRowToIndex(col, row, cols)] = 1;
    }
}
function patchNavWalkableCellIndexRegion(state, cache, idx) {
    const grid = state.obstacleGrid;
    const navTopology = state.nav.topology;
    const cols = grid.cols;
    const patchBounds = padCellIdxToGrid(idx, cols, grid.rows, 2);
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
    const cellSize = grid.cellSize;
    const candidates = [];
    const seen = new Uint8Array(grid.cols * grid.rows);
    forEachGlobalCellInMapGenBounds(boundsConfig, (globalCol, globalRow) => {
        const col = grid.worldCol(globalCol * cellSize);
        const row = grid.worldRow(globalRow * cellSize);
        const idx = col + row * grid.cols;
        if (!isNavWalkableCell(grid, navTopology, idx)) return;
        if (seen[idx]) return;
        seen[idx] = 1;
        candidates.push({ col, row });
    });
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
    writeNavWalkableFlags(cache.flags, grid.cols, cells);
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
/** @param {NavWalkableIndex} navWalkableIndex @param {number} idx */
export function isNavWalkableCellAtIndex(navWalkableIndex, idx) {
    return isNavWalkableAt(navWalkableIndex, idx);
}
export function isNavWalkableCellAt(state, col, row, boundsConfig = state.editor.cavernConfig, floodSeedBounds = null) {
    const index = getNavWalkableCellIndex(state, boundsConfig, floodSeedBounds);
    if (!cellInRect(col, row, index.cols, index.rows)) return false;
    return isNavWalkableAt(index, col + row * index.cols);
}
/**
 * Rebake the cached nav-walkable index after navigation epoch advances (e.g. wall edit).
 * When damageBounds is set, only re-evaluates walkability and flood connectivity around the edit.
 * No-op when no snake/nav bounds cache exists yet.
 * @param {object} state
 * @param {import("../../DataStructures/CellRect.js").CellBounds | null} [damageBounds]
 */
export function patchNavWalkableCellIndex(state, idx = null) {
    const cache = state.sandbox._navWalkableCellsCache;
    if (!cache?.boundsConfig) return null;
    if (idx === null || !cache.candidates) return bakeNavWalkableCellIndex(state, cache.boundsConfig, cache.floodSeedBounds);
    return patchNavWalkableCellIndexRegion(state, cache, idx);
}
export function pickWalkableCell(openCells, { cols, excludeIndices = null, rng = Math.random } = {}) {
    const candidates = excludeIndices ? openCells.filter((cell) => !excludeIndices.has(cellIndex(cell.col, cell.row, cols))) : openCells;
    if (!candidates.length) return null;
    return candidates[Math.floor(rng() * candidates.length)];
}
export function pickNavWalkableCell(state, { boundsConfig = state.editor.cavernConfig, floodSeedBounds = null, excludeIndices = null, filterBoundsConfig = null, rng = Math.random } = {}) {
    let cells = getNavWalkableCells(state, boundsConfig, floodSeedBounds);
    if (filterBoundsConfig) cells = filterWalkableCellsInBounds(cells, state.obstacleGrid, filterBoundsConfig);
    return pickWalkableCell(cells, { cols: state.obstacleGrid.cols, excludeIndices, rng });
}
export function createNavWalkableAccess(state, boundsConfig, { floodSeedBounds = null } = {}) {
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
        has(col, row) {
            const index = ensure();
            if (!cellInRect(col, row, index.cols, index.rows)) return false;
            return isNavWalkableAt(index, col + row * index.cols);
        },
        pick({ excludeIndices = null, filterBoundsConfig = null, rng = Math.random } = {}) {
            return pickNavWalkableCell(state, { boundsConfig, floodSeedBounds, excludeIndices, filterBoundsConfig, rng });
        },
        filterInBounds(filterBoundsConfig) {
            return filterWalkableCellsInBounds(this.cells(), state.obstacleGrid, filterBoundsConfig);
        },
    };
}
export function pickRandomWalkableCell(state, { excludeIndices = null, boundsConfig = state.editor.cavernConfig, rng = Math.random } = {}) {
    const openCells = collectWalkableCells(state, boundsConfig);
    return pickWalkableCell(openCells, { cols: state.obstacleGrid.cols, excludeIndices, rng });
}
