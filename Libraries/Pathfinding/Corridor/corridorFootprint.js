import { layoutAbsCellIndex, undirectedPairIndex } from "../../Spatial/grid/GridUtils.js";
/** @typedef {{ c: number, r: number }} CorridorCell */
/** @typedef {import("../../Spatial/grid/GridUtils.js").CellIndexLayout} CellIndexLayout */
/** @param {number} width */
export function corridorPerpendicularOffsets(width) {
    const offsets = new Array(width);
    const base = (width - 1) >> 1;
    for (let i = 0; i < width; i++) offsets[i] = i - base;
    return offsets;
}
/** @param {CorridorCell} p @param {CorridorCell | undefined} prev @param {CorridorCell | undefined} next @param {number} corridorWidth @param {boolean} interiorOnly @param {number} pathIndex @param {number} pathLength @param {CellIndexLayout} layout */
export function collectCorridorPathPointCells(p, prev, next, corridorWidth, interiorOnly, pathIndex, pathLength, layout) {
    if (interiorOnly && (pathIndex === 0 || pathIndex === pathLength - 1)) return [];
    const offsets = corridorPerpendicularOffsets(corridorWidth);
    let alongH = false;
    let alongV = false;
    if (prev) {
        if (prev.c !== p.c) alongH = true;
        if (prev.r !== p.r) alongV = true;
    }
    if (next) {
        if (next.c !== p.c) alongH = true;
        if (next.r !== p.r) alongV = true;
    }
    /** @type {CorridorCell[]} */
    const cells = [];
    if (alongH && alongV) {
        /** @type {Set<number>} */
        const seen = new Set();
        for (let oi = 0; oi < offsets.length; oi++) {
            const h = { c: p.c, r: p.r + offsets[oi] };
            const v = { c: p.c + offsets[oi], r: p.r };
            const hk = layoutAbsCellIndex(layout, h.c, h.r);
            const vk = layoutAbsCellIndex(layout, v.c, v.r);
            if (!seen.has(hk)) {
                seen.add(hk);
                cells.push(h);
            }
            if (!seen.has(vk)) {
                seen.add(vk);
                cells.push(v);
            }
        }
        return cells;
    }
    if (alongH) {
        for (let oi = 0; oi < offsets.length; oi++) cells.push({ c: p.c, r: p.r + offsets[oi] });
        return cells;
    }
    if (alongV) {
        for (let oi = 0; oi < offsets.length; oi++) cells.push({ c: p.c + offsets[oi], r: p.r });
        return cells;
    }
    cells.push({ c: p.c, r: p.r });
    return cells;
}
/** @param {CorridorCell[]} path @param {number} corridorWidth @param {CellIndexLayout} layout @param {{ interiorOnly?: boolean }} [options] */
export function corridorPathOccupiedCellIndices(path, corridorWidth, layout, options = {}) {
    const interiorOnly = options.interiorOnly !== false;
    /** @type {Set<number>} */
    const indices = new Set();
    for (let i = 0; i < path.length; i++) {
        const cells = collectCorridorPathPointCells(path[i], path[i - 1], path[i + 1], corridorWidth, interiorOnly, i, path.length, layout);
        for (let ci = 0; ci < cells.length; ci++) indices.add(layoutAbsCellIndex(layout, cells[ci].c, cells[ci].r));
    }
    return indices;
}
/** @param {CorridorCell[]} path @param {number} pathWidth @param {CorridorCell[][]} others @param {number[]} otherWidths @param {CellIndexLayout} layout @param {{ interiorOnly?: boolean }} [options] */
export function corridorPathIntersectsPaths(path, pathWidth, others, otherWidths, layout, options = {}) {
    const indices = corridorPathOccupiedCellIndices(path, pathWidth, layout, options);
    for (let i = 0; i < others.length; i++) {
        const otherIndices = corridorPathOccupiedCellIndices(others[i], otherWidths[i], layout, options);
        for (const idx of otherIndices) if (indices.has(idx)) return true;
    }
    return false;
}
/** @param {CorridorCell[]} path @param {CorridorCell[][]} others @param {number} corridorWidth @param {CellIndexLayout} layout @param {number[]} [otherWidths] */
export function corridorPathIntersectsAny(path, others, corridorWidth, layout, otherWidths) {
    const widths = otherWidths ?? others.map(() => corridorWidth);
    return corridorPathIntersectsPaths(path, corridorWidth, others, widths, layout);
}
/** @param {CorridorCell[]} path @param {CorridorCell[][]} others @param {number} corridorWidth @param {CellIndexLayout} layout @param {number[]} [otherWidths] */
export function corridorPathFootprintsOverlap(path, others, corridorWidth, layout, otherWidths) {
    return corridorPathIntersectsAny(path, others, corridorWidth, layout, otherWidths);
}
/** @param {CorridorCell[][]} paths @param {number[]} widths @param {CellIndexLayout} layout @param {{ interiorOnly?: boolean }} [options] */
export function corridorPathsToOccupiedCellIndices(paths, widths, layout, options = {}) {
    /** @type {Set<number>} */
    const indices = new Set();
    for (let i = 0; i < paths.length; i++) {
        const laneIndices = corridorPathOccupiedCellIndices(paths[i], widths[i], layout, options);
        for (const idx of laneIndices) indices.add(idx);
    }
    return indices;
}
/** @param {CorridorCell[][]} paths @param {number} corridorWidth @param {CellIndexLayout} layout @param {{ interiorOnly?: boolean }} [options] */
export function corridorPathsToOccupiedCellIndicesUniform(paths, corridorWidth, layout, options = {}) {
    return corridorPathsToOccupiedCellIndices(
        paths,
        paths.map(() => corridorWidth),
        layout,
        options,
    );
}
/** @param {CorridorCell[]} path @param {Set<number>} occupied @param {number} corridorWidth @param {CellIndexLayout} layout @param {{ interiorOnly?: boolean }} [options] */
export function corridorPathHitsOccupied(path, occupied, corridorWidth, layout, options = {}) {
    const indices = corridorPathOccupiedCellIndices(path, corridorWidth, layout, options);
    for (const idx of indices) if (occupied.has(idx)) return true;
    return false;
}
