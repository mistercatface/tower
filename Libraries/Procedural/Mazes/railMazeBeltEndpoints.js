import { gridSideFromCellToNeighbor } from "../../Spatial/grid/FloorCell.js";
import { cellInRect, gridSideNeighborCell } from "../../Spatial/grid/GridUtils.js";
import { createNavGraphViewFromTopology } from "../../Navigation/navGraph.js";
function oppositeSide(side) {
    return (side + 2) % 4;
}
/** True when at least one cardinal side has an open, bidirectional step to a walkable neighbor. */
export function hasOpenBeltMouthSideIdx(grid, navTopology, idx) {
    const cols = grid.cols;
    const rows = grid.rows;
    if (grid.isBlockedIdx(idx)) return false;
    const c = idx % cols;
    const r = (idx / cols) | 0;
    const navGraph = createNavGraphViewFromTopology(navTopology);
    // West
    if (c > 0) {
        const nIdx = idx - 1;
        if (!grid.isBlockedIdx(nIdx) && navGraph.canStepIdx(nIdx, idx) && navGraph.canStepIdx(idx, nIdx)) return true;
    }
    // East
    if (c + 1 < cols) {
        const nIdx = idx + 1;
        if (!grid.isBlockedIdx(nIdx) && navGraph.canStepIdx(nIdx, idx) && navGraph.canStepIdx(idx, nIdx)) return true;
    }
    // North
    if (r > 0) {
        const nIdx = idx - cols;
        if (!grid.isBlockedIdx(nIdx) && navGraph.canStepIdx(nIdx, idx) && navGraph.canStepIdx(idx, nIdx)) return true;
    }
    // South
    if (r + 1 < rows) {
        const nIdx = idx + cols;
        if (!grid.isBlockedIdx(nIdx) && navGraph.canStepIdx(nIdx, idx) && navGraph.canStepIdx(idx, nIdx)) return true;
    }
    return false;
}
/** @param {number[]} cellIndices */
export function filterNavBeltEndpointCandidatesIdx(grid, navTopology, cellIndices) {
    const out = [];
    for (let i = 0; i < cellIndices.length; i++) {
        const idx = cellIndices[i];
        if (hasOpenBeltMouthSideIdx(grid, navTopology, idx)) out.push(idx);
    }
    return out;
}
export function beltPathMouthExteriorCells(path, cols) {
    const start = path[0];
    const second = path[1];
    const end = path[path.length - 1];
    const prev = path[path.length - 2];
    let sc, sr, s2c, s2r, ec, er, epc, epr;
    if (typeof start === "number") {
        sc = start % cols;
        sr = (start / cols) | 0;
        s2c = second % cols;
        s2r = (second / cols) | 0;
        ec = end % cols;
        er = (end / cols) | 0;
        epc = prev % cols;
        epr = (prev / cols) | 0;
    } else {
        sc = start.c;
        sr = start.r;
        s2c = second.c;
        s2r = second.r;
        ec = end.c;
        er = end.r;
        epc = prev.c;
        epr = prev.r;
    }
    const startFlowSide = gridSideFromCellToNeighbor(sc, sr, s2c, s2r);
    const startEntrySide = oppositeSide(startFlowSide);
    const entryNeighbor = gridSideNeighborCell(sc, sr, startEntrySide);
    const endEntrySide = gridSideFromCellToNeighbor(ec, er, epc, epr);
    const endExitSide = oppositeSide(endEntrySide);
    const exitNeighbor = gridSideNeighborCell(ec, er, endExitSide);
    return { entryExteriorIdx: entryNeighbor.col + entryNeighbor.row * cols, exitExteriorIdx: exitNeighbor.col + exitNeighbor.row * cols };
}
export function validateBeltPathMouthAccess(grid, navTopology, path, occupiedGlobalIndices = new Set()) {
    if (path.length < 2) return false;
    const cols = grid.cols;
    const rows = grid.rows;
    let startIdx, endIdx;
    if (typeof path[0] === "number") {
        startIdx = path[0];
        endIdx = path[path.length - 1];
    } else {
        startIdx = path[0].c + path[0].r * cols;
        endIdx = path[path.length - 1].c + path[path.length - 1].r * cols;
    }
    const { entryExteriorIdx, exitExteriorIdx } = beltPathMouthExteriorCells(path, cols);
    const entryCol = entryExteriorIdx % cols;
    const entryRow = (entryExteriorIdx / cols) | 0;
    const exitCol = exitExteriorIdx % cols;
    const exitRow = (exitExteriorIdx / cols) | 0;
    if (!cellInRect(entryCol, entryRow, cols, rows)) return false;
    if (!cellInRect(exitCol, exitRow, cols, rows)) return false;
    if (grid.isBlockedIdx(entryExteriorIdx)) return false;
    if (grid.isBlockedIdx(exitExteriorIdx)) return false;
    if (occupiedGlobalIndices.has(entryExteriorIdx)) return false;
    if (occupiedGlobalIndices.has(exitExteriorIdx)) return false;
    const navGraph = createNavGraphViewFromTopology(navTopology);
    if (!navGraph.canStepIdx(entryExteriorIdx, startIdx)) return false;
    if (!navGraph.canStepIdx(endIdx, exitExteriorIdx)) return false;
    return true;
}
export function collectPathMouthExteriorIndices(paths, grid) {
    const cols = grid.cols;
    const mouths = new Set();
    for (let i = 0; i < paths.length; i++) {
        const path = paths[i];
        if (path.length < 2) continue;
        let startIdx, endIdx;
        if (typeof path[0] === "number") {
            startIdx = path[0];
            endIdx = path[path.length - 1];
        } else {
            startIdx = path[0].c + path[0].r * cols;
            endIdx = path[path.length - 1].c + path[path.length - 1].r * cols;
        }
        mouths.add(startIdx);
        mouths.add(endIdx);
        const { entryExteriorIdx, exitExteriorIdx } = beltPathMouthExteriorCells(path, cols);
        mouths.add(entryExteriorIdx);
        mouths.add(exitExteriorIdx);
    }
    return mouths;
}
