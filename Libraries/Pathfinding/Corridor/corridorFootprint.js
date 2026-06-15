/** @typedef {{ c: number, r: number }} CorridorCell */

/** @param {number} width */
export function corridorPerpendicularOffsets(width) {
    const offsets = new Array(width);
    const base = (width - 1) >> 1;
    for (let i = 0; i < width; i++) offsets[i] = i - base;
    return offsets;
}

/** @param {CorridorCell} cell */
export function corridorCellKey(cell) {
    return `${cell.c},${cell.r}`;
}

/** @param {CorridorCell} p @param {CorridorCell | undefined} prev @param {CorridorCell | undefined} next @param {number} corridorWidth @param {boolean} interiorOnly @param {number} pathIndex @param {number} pathLength */
export function collectCorridorPathPointCells(p, prev, next, corridorWidth, interiorOnly, pathIndex, pathLength) {
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
        /** @type {Set<string>} */
        const seen = new Set();
        for (let oi = 0; oi < offsets.length; oi++) {
            const h = { c: p.c, r: p.r + offsets[oi] };
            const v = { c: p.c + offsets[oi], r: p.r };
            const hk = corridorCellKey(h);
            const vk = corridorCellKey(v);
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

/** @param {CorridorCell[]} path @param {number} corridorWidth @param {{ interiorOnly?: boolean }} [options] */
export function corridorPathOccupiedCellKeys(path, corridorWidth, options = {}) {
    const interiorOnly = options.interiorOnly !== false;
    /** @type {Set<string>} */
    const keys = new Set();
    for (let i = 0; i < path.length; i++) {
        const cells = collectCorridorPathPointCells(path[i], path[i - 1], path[i + 1], corridorWidth, interiorOnly, i, path.length);
        for (let ci = 0; ci < cells.length; ci++) keys.add(corridorCellKey(cells[ci]));
    }
    return keys;
}

/** @param {CorridorCell[]} path @param {CorridorCell[][]} others @param {number} corridorWidth */
export function corridorPathIntersectsAny(path, others, corridorWidth) {
    const keys = corridorPathOccupiedCellKeys(path, corridorWidth);
    for (let i = 0; i < others.length; i++) {
        const otherKeys = corridorPathOccupiedCellKeys(others[i], corridorWidth);
        for (const key of otherKeys) if (keys.has(key)) return true;
    }
    return false;
}

/** @param {CorridorCell[][]} paths @param {number} corridorWidth @param {{ interiorOnly?: boolean }} [options] */
export function corridorPathsToOccupiedKeys(paths, corridorWidth, options = {}) {
    /** @type {Set<string>} */
    const keys = new Set();
    for (let i = 0; i < paths.length; i++) {
        const laneKeys = corridorPathOccupiedCellKeys(paths[i], corridorWidth, options);
        for (const key of laneKeys) keys.add(key);
    }
    return keys;
}

/** @param {CorridorCell[]} path @param {Set<string>} occupied @param {number} corridorWidth @param {{ interiorOnly?: boolean }} [options] */
export function corridorPathHitsOccupied(path, occupied, corridorWidth, options = {}) {
    const keys = corridorPathOccupiedCellKeys(path, corridorWidth, options);
    for (const key of keys) if (occupied.has(key)) return true;
    return false;
}
