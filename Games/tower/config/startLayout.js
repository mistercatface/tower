/** @typedef {{ col: number, row: number }} GridCell */
const CENTER_COL = Math.floor(49 / 2);
const BUILDING_ROWS = 34;
const ENTRANCE_ROW = BUILDING_ROWS - 1;
const SPAWN_SOUTH_OF_ENTRANCE = 8;
/** @type {{ col: number, row: number, cols: number, rows: number }} */
export const guardRoom = { col: CENTER_COL - 4, row: 14, cols: 9, rows: 7 };
/**
 * Opening building layout — grid geometry and named spawn cells.
 * StartGameBuilding.js interprets this into world positions.
 */
export const startLayoutConfig = {
    grid: { cols: 49, buildingRows: BUILDING_ROWS, spawnSouthOfEntrance: SPAWN_SOUTH_OF_ENTRANCE, yardRowsPadding: 2, entranceWidth: 5, bspSeed: 0x7e400001 },
    guardRoom,
    centerCol: CENTER_COL,
    /** @type {Record<string, GridCell>} */
    spawnSlots: {
        yard: { col: CENTER_COL, row: ENTRANCE_ROW + SPAWN_SOUTH_OF_ENTRANCE },
        foyer: { col: CENTER_COL, row: BUILDING_ROWS - 5 },
        corridor: { col: CENTER_COL, row: guardRoom.row + guardRoom.rows + 3 },
        guard_left: { col: guardRoom.col + 2, row: guardRoom.row + Math.floor(guardRoom.rows / 2) },
        guard_right: { col: guardRoom.col + guardRoom.cols - 3, row: guardRoom.row + Math.floor(guardRoom.rows / 2) },
    },
    guardFace: { col: CENTER_COL, row: BUILDING_ROWS - 1 },
    spawnClearRadius: 48,
};
