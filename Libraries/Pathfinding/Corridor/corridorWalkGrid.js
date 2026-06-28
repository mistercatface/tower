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
/** @param {RoomRect[]} rooms @param {number} c @param {number} r */
export function cellInsideAnyRoom(rooms, c, r) {
    for (let i = 0; i < rooms.length; i++) {
        const node = rooms[i];
        if (c >= node.c0 && c <= node.c1 && r >= node.r0 && r <= node.r1) return true;
    }
    return false;
}
/** @param {import("./corridorFootprint.js").CorridorCell[]} path @param {RoomRect[]} rooms */
export function corridorPathMidCellsClear(rooms, path) {
    for (let i = 1; i < path.length - 1; i++) if (cellInsideAnyRoom(rooms, path[i].c, path[i].r)) return false;
    return true;
}
/** @param {import("./corridorFootprint.js").CorridorCell[]} path @param {RoomRect[]} rooms @param {number} corridorWidth @param {import("../../Spatial/grid/GridUtils.js").CellIndexLayout} layout */
export function corridorPathFootprintInsideAnyRoom(rooms, path, corridorWidth, layout) {
    const stride = layout.strideCols;
    for (let i = 0; i < path.length; i++) {
        let p, prev, next;
        if (typeof path[i] === "number") {
            const pIdx = path[i];
            p = { c: (pIdx % stride) + layout.originCol, r: ((pIdx / stride) | 0) + layout.originRow };
            prev = i > 0 ? { c: (path[i - 1] % stride) + layout.originCol, r: ((path[i - 1] / stride) | 0) + layout.originRow } : undefined;
            next = i + 1 < path.length ? { c: (path[i + 1] % stride) + layout.originCol, r: ((path[i + 1] / stride) | 0) + layout.originRow } : undefined;
        } else {
            p = path[i];
            prev = i > 0 ? path[i - 1] : undefined;
            next = i + 1 < path.length ? path[i + 1] : undefined;
        }
        const cells = collectCorridorPathPointCells(p, prev, next, corridorWidth, false, i, path.length, layout);
        for (let ci = 0; ci < cells.length; ci++) if (cellInsideAnyRoom(rooms, cells[ci].c, cells[ci].r)) return true;
    }
    return false;
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
