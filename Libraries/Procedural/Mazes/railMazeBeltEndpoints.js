import { gridSideFromCellToNeighbor, gridSideFromCellIdxToNeighborIdx } from "../../Spatial/grid/FloorCell.js";
import { cellInRect, gridSideNeighborCell } from "../../Spatial/grid/GridUtils.js";
import { edgeNeighborIdx } from "../../Spatial/grid/gridCellTopology.js";
import { createNavGraphViewFromTopology } from "../../Navigation/navGraph.js";
function oppositeSide(side) {
    return (side + 2) % 4;
}
/** True when at least one cardinal side has an open, bidirectional step to a walkable neighbor. */
export function hasOpenBeltMouthSideIdx(grid, navTopology, idx) {
    const cols = grid.cols;
    const rows = grid.rows;
    if (grid.isBlockedIdx(idx)) return false;
    const navGraph = createNavGraphViewFromTopology(navTopology);
    // West
    if (idx % cols > 0) {
        const nIdx = idx - 1;
        if (!grid.isBlockedIdx(nIdx) && navGraph.canStepIdx(nIdx, idx) && navGraph.canStepIdx(idx, nIdx)) return true;
    }
    // East
    if ((idx + 1) % cols !== 0) {
        const nIdx = idx + 1;
        if (!grid.isBlockedIdx(nIdx) && navGraph.canStepIdx(nIdx, idx) && navGraph.canStepIdx(idx, nIdx)) return true;
    }
    // North
    if (idx >= cols) {
        const nIdx = idx - cols;
        if (!grid.isBlockedIdx(nIdx) && navGraph.canStepIdx(nIdx, idx) && navGraph.canStepIdx(idx, nIdx)) return true;
    }
    // South
    if (idx < cols * (rows - 1)) {
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
export function beltPathMouthExteriorCells(path, cols, rows) {
    const start = path[0];
    const second = path[1];
    const end = path[path.length - 1];
    const prev = path[path.length - 2];
    let startIdx, secondIdx, endIdx, prevIdx;
    if (typeof start === "number") {
        startIdx = start;
        secondIdx = second;
        endIdx = end;
        prevIdx = prev;
    } else {
        startIdx = start.c + start.r * cols;
        secondIdx = second.c + second.r * cols;
        endIdx = end.c + end.r * cols;
        prevIdx = prev.c + prev.r * cols;
    }
    const startFlowSide = gridSideFromCellIdxToNeighborIdx(startIdx, secondIdx, cols);
    const startEntrySide = oppositeSide(startFlowSide);
    const entryExteriorIdx = edgeNeighborIdx(startIdx, startEntrySide, cols, rows);
    const endEntrySide = gridSideFromCellIdxToNeighborIdx(endIdx, prevIdx, cols);
    const endExitSide = oppositeSide(endEntrySide);
    const exitExteriorIdx = edgeNeighborIdx(endIdx, endExitSide, cols, rows);
    return { entryExteriorIdx, exitExteriorIdx };
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
    const { entryExteriorIdx, exitExteriorIdx } = beltPathMouthExteriorCells(path, cols, rows);
    if (entryExteriorIdx === -1 || exitExteriorIdx === -1) return false;
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
    const rows = grid.rows;
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
        const { entryExteriorIdx, exitExteriorIdx } = beltPathMouthExteriorCells(path, cols, rows);
        if (entryExteriorIdx !== -1) mouths.add(entryExteriorIdx);
        if (exitExteriorIdx !== -1) mouths.add(exitExteriorIdx);
    }
    return mouths;
}
