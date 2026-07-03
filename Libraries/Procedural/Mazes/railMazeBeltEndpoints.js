import { edgeNeighborIdx, edgeMirrorSide } from "../../Spatial/grid/gridCellTopology.js";
import { createNavGraphViewFromTopology } from "../../Navigation/navGraph.js";
import { cellInRect, gridSideNeighborCell, forEachCardinalNeighborIdx } from "../../Spatial/grid/GridUtils.js";
import { gridSideFromCellToNeighbor, gridSideFromCellIdxToNeighborIdx } from "../../Spatial/grid/FloorCell.js";
function oppositeSide(side) {
    return edgeMirrorSide(side);
}
/** True when at least one cardinal side has an open, bidirectional step to a walkable neighbor. */
export function hasOpenBeltMouthSideIdx(grid, navTopology, idx) {
    const cols = grid.cols;
    const rows = grid.rows;
    if (grid.isBlockedIdx(idx)) return false;
    const navGraph = createNavGraphViewFromTopology(navTopology);
    let open = false;
    forEachCardinalNeighborIdx(idx, cols, rows, (nIdx) => {
        if (open) return;
        if (!grid.isBlockedIdx(nIdx) && navGraph.canStepIdx(nIdx, idx) && navGraph.canStepIdx(idx, nIdx)) open = true;
    });
    return open;
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
const getIdx = (p, cols) => (typeof p === "number" ? p : p.c !== undefined ? p.c + p.r * cols : p.col + p.row * cols);
export function beltPathMouthExteriorCells(path, cols, rows) {
    const startIdx = getIdx(path[0], cols);
    const secondIdx = getIdx(path[1], cols);
    const endIdx = getIdx(path[path.length - 1], cols);
    const prevIdx = getIdx(path[path.length - 2], cols);
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
    const startIdx = getIdx(path[0], cols);
    const endIdx = getIdx(path[path.length - 1], cols);
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
        const startIdx = getIdx(path[0], cols);
        const endIdx = getIdx(path[path.length - 1], cols);
        mouths.add(startIdx);
        mouths.add(endIdx);
        const { entryExteriorIdx, exitExteriorIdx } = beltPathMouthExteriorCells(path, cols, rows);
        if (entryExteriorIdx !== -1) mouths.add(entryExteriorIdx);
        if (exitExteriorIdx !== -1) mouths.add(exitExteriorIdx);
    }
    return mouths;
}
