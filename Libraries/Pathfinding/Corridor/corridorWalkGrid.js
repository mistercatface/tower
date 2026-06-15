/** @typedef {{ c0: number, c1: number, r0: number, r1: number }} RoomRect */

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
    const grid = new Uint8Array(cols * rows);
    for (let r = 0; r < rows; r++)
        for (let c = 0; c < cols; c++) if (cellInsideAnyRoom(rooms, c, r)) grid[r * cols + c] = 1;
    return grid;
}
