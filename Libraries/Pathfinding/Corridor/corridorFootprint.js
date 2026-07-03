import { layoutAbsCellIndex } from "../../Spatial/grid/GridUtils.js";
/** @param {number} width */
export function corridorPerpendicularOffsets(width) {
    const offsets = new Array(width);
    const base = (width - 1) >> 1;
    for (let i = 0; i < width; i++) offsets[i] = i - base;
    return offsets;
}
/** @param {number} pIdx @param {number | undefined} prevIdx @param {number | undefined} nextIdx @param {number} corridorWidth @param {boolean} interiorOnly @param {number} pathIndex @param {number} pathLength @param {import("../../Spatial/grid/GridUtils.js").CellIndexLayout} layout */
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
    /** @type {number[]} */
    const indices = [];
    if (alongH && alongV) {
        /** @type {Set<number>} */
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
/** @param {number[]} path @param {number} corridorWidth @param {import("../../Spatial/grid/GridUtils.js").CellIndexLayout} layout @param {{ interiorOnly?: boolean }} [options] */
export function corridorPathOccupiedCellIndices(path, corridorWidth, layout, options = {}) {
    const interiorOnly = options.interiorOnly !== false;
    /** @type {Set<number>} */
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
/** @param {number[]} path @param {number} pathWidth @param {number[][]} others @param {number[]} otherWidths @param {import("../../Spatial/grid/GridUtils.js").CellIndexLayout} layout @param {{ interiorOnly?: boolean }} [options] */
export function corridorPathIntersectsPaths(path, pathWidth, others, otherWidths, layout, options = {}) {
    const indices = corridorPathOccupiedCellIndices(path, pathWidth, layout, options);
    for (let i = 0; i < others.length; i++) {
        const otherIndices = corridorPathOccupiedCellIndices(others[i], otherWidths[i], layout, options);
        for (const idx of otherIndices) if (indices.has(idx)) return true;
    }
    return false;
}
/** @param {number[]} path @param {number[][]} others @param {number} corridorWidth @param {import("../../Spatial/grid/GridUtils.js").CellIndexLayout} layout @param {number[]} [otherWidths] */
export function corridorPathIntersectsAny(path, others, corridorWidth, layout, otherWidths) {
    const widths = otherWidths ?? others.map(() => corridorWidth);
    return corridorPathIntersectsPaths(path, corridorWidth, others, widths, layout);
}
/** @param {number[]} path @param {number[][]} others @param {number} corridorWidth @param {import("../../Spatial/grid/GridUtils.js").CellIndexLayout} layout @param {number[]} [otherWidths] */
export function corridorPathFootprintsOverlap(path, others, corridorWidth, layout, otherWidths) {
    return corridorPathIntersectsAny(path, others, corridorWidth, layout, otherWidths);
}
/** @param {number[][]} paths @param {number[]} widths @param {import("../../Spatial/grid/GridUtils.js").CellIndexLayout} layout @param {{ interiorOnly?: boolean }} [options] */
export function corridorPathsToOccupiedCellIndices(paths, widths, layout, options = {}) {
    /** @type {Set<number>} */
    const indices = new Set();
    for (let i = 0; i < paths.length; i++) {
        const laneIndices = corridorPathOccupiedCellIndices(paths[i], widths[i], layout, options);
        for (const idx of laneIndices) indices.add(idx);
    }
    return indices;
}
/** @param {number[][]} paths @param {number} corridorWidth @param {import("../../Spatial/grid/GridUtils.js").CellIndexLayout} layout @param {{ interiorOnly?: boolean }} [options] */
export function corridorPathsToOccupiedCellIndicesUniform(paths, corridorWidth, layout, options = {}) {
    return corridorPathsToOccupiedCellIndices(
        paths,
        paths.map(() => corridorWidth),
        layout,
        options,
    );
}
/** @param {number[]} path @param {Set<number>} occupied @param {number} corridorWidth @param {import("../../Spatial/grid/GridUtils.js").CellIndexLayout} layout @param {{ interiorOnly?: boolean }} [options] */
export function corridorPathHitsOccupied(path, occupied, corridorWidth, layout, options = {}) {
    const indices = corridorPathOccupiedCellIndices(path, corridorWidth, layout, options);
    for (const idx of indices) if (occupied.has(idx)) return true;
    return false;
}
