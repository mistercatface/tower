/** @typedef {{ c0: number, c1: number, r0: number, r1: number }} RoomRect */
/** @typedef {{ originCol: number, originRow: number, cols: number, rows: number }} CorridorSearchBounds */

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

/** @param {number} originCol @param {number} originRow @param {number} cols @param {number} rows @param {RoomRect[]} rooms */
export function buildRoomInteriorBlockedGridLocal(originCol, originRow, cols, rows, rooms) {
    const grid = new Uint8Array(cols * rows);
    for (let i = 0; i < rooms.length; i++) {
        const node = rooms[i];
        const cStart = Math.max(node.c0, originCol);
        const cEnd = Math.min(node.c1, originCol + cols - 1);
        const rStart = Math.max(node.r0, originRow);
        const rEnd = Math.min(node.r1, originRow + rows - 1);
        for (let r = rStart; r <= rEnd; r++)
            for (let c = cStart; c <= cEnd; c++) grid[(r - originRow) * cols + (c - originCol)] = 1;
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

/** @param {number} cols @param {number} rows @param {RoomRect[]} rooms */
export function buildRoomInteriorBlockedGrid(cols, rows, rooms) {
    const bounds = corridorSearchBounds(rooms, 0);
    return buildRoomInteriorBlockedGridLocal(bounds.originCol, bounds.originRow, bounds.cols, bounds.rows, rooms);
}
