import { maxCorridorWidthBetweenNodes } from "../Pathfinding/Corridor/index.js";

export const MAX_CORRIDOR_COUNT = 100;

/** @param {{ col: number, row: number, width: number, height: number }} node */
export function roomNodeRouteRect(node) {
    const c0 = node.col;
    const r0 = node.row;
    const c1 = node.col + node.width - 1;
    const r1 = node.row + node.height - 1;
    return { c0, r0, c1, r1, centerC: c0 + ((node.width - 1) / 2) | 0, centerR: r0 + ((node.height - 1) / 2) | 0 };
}

/** @param {number} min @param {number} max @param {number} floor @param {number} ceiling */
export function normalizeCorridorRange(min, max, floor, ceiling) {
    let lo = Math.max(floor, Math.round(min));
    let hi = Math.max(floor, Math.round(max));
    if (lo > hi) {
        const t = lo;
        lo = hi;
        hi = t;
    }
    hi = Math.min(hi, ceiling);
    lo = Math.min(lo, hi);
    return { min: lo, max: hi };
}

/** @param {import("./roomGraphStore.js").RoomLink} link */
export function ensureLinkCorridorFields(link) {
    if (link.corridorCount == null) link.corridorCount = link.corridorCountMax ?? link.corridorCountMin ?? 1;
    if (link.corridorWidthMin == null && link.corridorWidthMax == null) {
        const width = link.corridorWidth ?? 1;
        link.corridorWidthMin = width;
        link.corridorWidthMax = width;
    }
    delete link.corridorCountMin;
    delete link.corridorCountMax;
    delete link.corridorWidth;
}

/** @param {import("./roomGraphStore.js").RoomNode} nodeA @param {import("./roomGraphStore.js").RoomNode} nodeB */
export function linkCorridorLimits(nodeA, nodeB) {
    const a = roomNodeRouteRect(nodeA);
    const b = roomNodeRouteRect(nodeB);
    return { maxWidth: maxCorridorWidthBetweenNodes(a, b), maxCount: MAX_CORRIDOR_COUNT };
}

/** @param {import("./roomGraphStore.js").RoomLink} link @param {import("./roomGraphStore.js").RoomNode} nodeA @param {import("./roomGraphStore.js").RoomNode} nodeB */
export function clampLinkCorridorRanges(link, nodeA, nodeB) {
    ensureLinkCorridorFields(link);
    const limits = linkCorridorLimits(nodeA, nodeB);
    const widthRange = normalizeCorridorRange(link.corridorWidthMin, link.corridorWidthMax, 1, limits.maxWidth);
    link.corridorWidthMin = widthRange.min;
    link.corridorWidthMax = widthRange.max;
    link.corridorCount = Math.min(MAX_CORRIDOR_COUNT, Math.max(1, Math.round(link.corridorCount)));
    return { ...limits, maxCount: MAX_CORRIDOR_COUNT };
}

/** @param {import("./roomGraphStore.js").RoomLink} link @param {import("./roomGraphStore.js").RoomNode} nodeA @param {import("./roomGraphStore.js").RoomNode} nodeB @param {() => number} rng */
export function resolveLinkCorridorRoll(link, nodeA, nodeB, rng) {
    ensureLinkCorridorFields(link);
    const a = roomNodeRouteRect(nodeA);
    const b = roomNodeRouteRect(nodeB);
    const maxWidth = maxCorridorWidthBetweenNodes(a, b);
    const widthRange = normalizeCorridorRange(link.corridorWidthMin, link.corridorWidthMax, 1, maxWidth);
    const spanW = widthRange.max - widthRange.min + 1;
    const corridorCount = Math.min(MAX_CORRIDOR_COUNT, Math.max(1, Math.round(link.corridorCount)));
    /** @type {number[]} */
    const corridorWidths = new Array(corridorCount);
    for (let i = 0; i < corridorCount; i++) corridorWidths[i] = widthRange.min + ((rng() * spanW) | 0);
    return { corridorCount, corridorWidths, maxWidth };
}
