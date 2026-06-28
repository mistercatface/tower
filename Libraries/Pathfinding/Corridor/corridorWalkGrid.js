/** @typedef {{ c0: number, c1: number, r0: number, r1: number }} RoomRect */
/** @typedef {{ originCol: number, originRow: number, cols: number, rows: number }} CorridorSearchBounds */
import { createCellIndexLayout, layoutCellRows, layoutAbsCellIndex } from "../../Spatial/grid/GridUtils.js";
import { collectCorridorPathPointCells } from "./corridorFootprint.js";
/** @param {RoomRect[]} rooms @param {number} [pad] */
export function corridorSearchBounds(rooms, pad = 12) {
    let c0 = Infinity;
    let r0 = Infinity;
    let c1 = -Infinity;
    let r1 = -Infinity;
    for (let i = 0; i < rooms.length; i++) {
        const node = rooms[i];
        c0 = Math.min(c0, node.c0);
        r0 = Math.min(r0, node.r0);
        c1 = Math.max(c1, node.c1);
        r1 = Math.max(r1, node.r1);
    }
    c0 -= pad;
    r0 -= pad;
    c1 += pad;
    r1 += pad;
    return { originCol: c0, originRow: r0, cols: c1 - c0 + 1, rows: r1 - r0 + 1 };
}
/** @param {import("../../Spatial/grid/GridUtils.js").CellIndexLayout} layout @param {RoomRect[]} rooms */
export function buildRoomInteriorBlockedGridForLayout(layout, rooms) {
    const grid = new Uint8Array(layout.cellCount);
    for (let i = 0; i < rooms.length; i++) {
        const node = rooms[i];
        const cStart = Math.max(node.c0, layout.originCol);
        const cEnd = Math.min(node.c1, layout.originCol + layout.strideCols - 1);
        const rStart = Math.max(node.r0, layout.originRow);
        const rEnd = Math.min(node.r1, layout.originRow + layoutCellRows(layout) - 1);
        for (let r = rStart; r <= rEnd; r++) for (let c = cStart; c <= cEnd; c++) grid[layoutAbsCellIndex(layout, c, r)] = 1;
    }
    return grid;
}
/**
 * @param {import("../../Spatial/grid/GridUtils.js").CellIndexLayout} layout
 * @param {RoomRect[]} rooms
 * @returns {Uint8Array}
 */
export function buildRoomFootprintMaskForLayout(layout, rooms) {
    const mask = new Uint8Array(layout.cellCount);
    if (!rooms) return mask;
    for (let i = 0; i < rooms.length; i++) {
        const node = rooms[i];
        const c0 = Math.max(layout.originCol, node.c0);
        const c1 = Math.min(layout.originCol + layout.strideCols - 1, node.c1);
        const r0 = Math.max(layout.originRow, node.r0);
        const r1 = Math.min(layout.originRow + Math.floor(layout.cellCount / layout.strideCols) - 1, node.r1);
        for (let r = r0; r <= r1; r++)
            for (let c = c0; c <= c1; c++) {
                const idx = (r - layout.originRow) * layout.strideCols + (c - layout.originCol);
                mask[idx] = 1;
            }
    }
    return mask;
}
/**
 * @param {Uint8Array} roomFootprintMask
 * @param {number} idx
 */
export function cellInsideAnyRoom(roomFootprintMask, idx) {
    return roomFootprintMask[idx] === 1;
}
/** @param {CorridorSearchBounds} bounds */
export function corridorSearchLayout(bounds) {
    return createCellIndexLayout(bounds.originCol, bounds.originRow, bounds.cols, bounds.rows);
}
/** @param {number} cols @param {number} rows @param {RoomRect[]} rooms */
export function buildRoomInteriorBlockedGrid(cols, rows, rooms) {
    const bounds = corridorSearchBounds(rooms, 0);
    return buildRoomInteriorBlockedGridForLayout(corridorSearchLayout(bounds), rooms);
}
