import {  gridSideFromCellIdxToNeighborIdx, FloorBelt  } from "../../Spatial/spatial.js";
import {  edgeMirrorSide  } from "../../Spatial/spatial.js";
/** @typedef {import("../../Spatial/grid/GridUtils.js").CellIndexLayout} CellIndexLayout */
/** @typedef {{ idx: number, kind: number, facingIndex: number }} BakedFloorBelt */
export function corridorPerpendicularOffsets(width) {
    const offsets = new Array(width);
    const base = (width - 1) >> 1;
    for (let i = 0; i < width; i++) offsets[i] = i - base;
    return offsets;
}
export function collectCorridorPathPointIndices(pIdx, prevIdx, nextIdx, corridorWidth, interiorOnly, pathIndex, pathLength, layout) {
    if (interiorOnly && (pathIndex === 0 || pathIndex === pathLength - 1)) return [];
    const offsets = corridorPerpendicularOffsets(corridorWidth);
    const stride = layout.strideCols;
    let alongH = false;
    let alongV = false;
    if (prevIdx !== undefined) {
        const diff = prevIdx - pIdx;
        if (Math.abs(diff) === 1) alongH = true;
        else if (Math.abs(diff) === stride) alongV = true;
    }
    if (nextIdx !== undefined) {
        const diff = nextIdx - pIdx;
        if (Math.abs(diff) === 1) alongH = true;
        else if (Math.abs(diff) === stride) alongV = true;
    }
    const indices = [];
    if (alongH && alongV) {
        const seen = new Set();
        for (let oi = 0; oi < offsets.length; oi++) {
            const hIdx = pIdx + offsets[oi] * stride;
            const vIdx = pIdx + offsets[oi];
            if (!seen.has(hIdx)) {
                seen.add(hIdx);
                indices.push(hIdx);
            }
            if (!seen.has(vIdx)) {
                seen.add(vIdx);
                indices.push(vIdx);
            }
        }
        return indices;
    }
    if (alongH) {
        for (let oi = 0; oi < offsets.length; oi++) indices.push(pIdx + offsets[oi] * stride);
        return indices;
    }
    if (alongV) {
        for (let oi = 0; oi < offsets.length; oi++) indices.push(pIdx + offsets[oi]);
        return indices;
    }
    indices.push(pIdx);
    return indices;
}
export function corridorPathOccupiedCellIndices(path, corridorWidth, layout, options = {}) {
    const interiorOnly = options.interiorOnly !== false;
    const indices = new Set();
    for (let i = 0; i < path.length; i++) {
        const pIdx = path[i];
        const prevIdx = i > 0 ? path[i - 1] : undefined;
        const nextIdx = i + 1 < path.length ? path[i + 1] : undefined;
        const ptIndices = collectCorridorPathPointIndices(pIdx, prevIdx, nextIdx, corridorWidth, interiorOnly, i, path.length, layout);
        for (let ci = 0; ci < ptIndices.length; ci++) indices.add(ptIndices[ci]);
    }
    return indices;
}
export function addCorridorPathToOccupied(path, occupied, corridorWidth, layout, options = {}) {
    const indices = corridorPathOccupiedCellIndices(path, corridorWidth, layout, options);
    for (const idx of indices) occupied.add(idx);
}
export function collapsePathRevisits(path, layout) {
    const out = [];
    const indexByKey = new Map();
    for (let i = 0; i < path.length; i++) {
        const pIdx = path[i];
        if (indexByKey.has(pIdx)) out.length = indexByKey.get(pIdx);
        indexByKey.set(pIdx, out.length);
        out.push(pIdx);
    }
    return out;
}
export function beltsForPathPolyline(path, width, layout) {
    const collapsed = collapsePathRevisits(path, layout);
    const byCell = new Map();
    const stride = layout.strideCols;
    for (let i = 0; i < collapsed.length; i++) {
        const pIdx = collapsed[i];
        const prevIdx = i > 0 ? collapsed[i - 1] : undefined;
        const nextIdx = i < collapsed.length - 1 ? collapsed[i + 1] : undefined;
        if (prevIdx !== undefined && pIdx === prevIdx) continue;
        const cells = collectCorridorPathPointIndices(pIdx, prevIdx, nextIdx, width, false, i, collapsed.length, layout);
        let spec;
        if (prevIdx !== undefined && nextIdx !== undefined) {
            const entrySide = gridSideFromCellIdxToNeighborIdx(pIdx, prevIdx, stride);
            const exitSide = gridSideFromCellIdxToNeighborIdx(pIdx, nextIdx, stride);
            spec = FloorBelt.resolveKindFromSides(entrySide, exitSide);
        } else if (nextIdx !== undefined) {
            const exitSide = gridSideFromCellIdxToNeighborIdx(pIdx, nextIdx, stride);
            const entrySide = edgeMirrorSide(exitSide);
            spec = FloorBelt.resolveKindFromSides(entrySide, exitSide);
        } else if (prevIdx !== undefined) {
            const entrySide = gridSideFromCellIdxToNeighborIdx(pIdx, prevIdx, stride);
            const exitSide = edgeMirrorSide(entrySide);
            spec = FloorBelt.resolveKindFromSides(entrySide, exitSide);
        } else spec = FloorBelt.resolveKindFromSides(3, 1);
        for (let ci = 0; ci < cells.length; ci++) {
            const idx = cells[ci];
            byCell.set(idx, { idx, kind: spec.kind, facingIndex: spec.facingIndex });
        }
    }
    return byCell;
}
export function buildCorridorBeltsFromPaths(paths, corridorWidths, layout) {
    const byCell = new Map();
    for (let pi = 0; pi < paths.length; pi++) {
        const laneBelts = beltsForPathPolyline(paths[pi], corridorWidths[pi], layout);
        for (const [key, belt] of laneBelts) byCell.set(key, belt);
    }
    return [...byCell.values()].map((belt) => ({ idx: belt.idx, kind: belt.kind, facingIndex: belt.facingIndex }));
}
export function corridorPathHitsOccupied(path, occupied, corridorWidth, layout, options = {}) {
    const indices = corridorPathOccupiedCellIndices(path, corridorWidth, layout, options);
    for (const idx of indices) if (occupied.has(idx)) return true;
    return false;
}
