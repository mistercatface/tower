import { Segment } from "../Entities/Wall.js";
import { snapLayoutOrigin, gridCellCenter } from "./GridLayout.js";

/** Fixed layout for map node 0 — player starts just south of the entrance. */
const GRID_COLS = 49;
const BUILDING_ROWS = 34;
const ENTRANCE_ROW = BUILDING_ROWS - 1;
const SPAWN_SOUTH_OF_ENTRANCE = 8;
const YARD_ROWS = SPAWN_SOUTH_OF_ENTRANCE + 2;
const GRID_ROWS = BUILDING_ROWS + YARD_ROWS;
const SPAWN_ROW = ENTRANCE_ROW + SPAWN_SOUTH_OF_ENTRANCE;
const SPAWN_COL = Math.floor(GRID_COLS / 2);
const ENTRANCE_WIDTH = 5;
const BSP_SEED = 0x7e400001;

/** Interior room for Chickpea / Garbanzo (grid cells). Connected to the entrance foyer. */
const GUARD_ROOM = {
    col: SPAWN_COL - 4,
    row: 14,
    cols: 9,
    rows: 7,
};

function createRng(seed) {
    let s = seed >>> 0;
    return () => {
        s = (s * 1664525 + 1013904223) >>> 0;
        return s / 0x100000000;
    };
}

function carveRect(grid, cols, x, y, w, h) {
    for (let r = y; r < y + h; r++) {
        for (let c = x; c < x + w; c++) {
            if (r >= 0 && r < GRID_ROWS && c >= 0 && c < GRID_COLS) {
                grid[r * cols + c] = 0;
            }
        }
    }
}

function createBspLeaf(random, minLeafSize) {
    return class Leaf {
        constructor(x, y, w, h) {
            this.x = x;
            this.y = y;
            this.w = w;
            this.h = h;
            this.leftChild = null;
            this.rightChild = null;
            this.room = null;
            this.halls = [];
        }

        split() {
            if (this.leftChild || this.rightChild) return false;
            let splitH = random() > 0.5;
            if (this.w > this.h && this.w / this.h >= 1.25) splitH = false;
            else if (this.h > this.w && this.h / this.w >= 1.25) splitH = true;
            const max = (splitH ? this.h : this.w) - minLeafSize;
            if (max <= minLeafSize) return false;
            const split = Math.floor(random() * (max - minLeafSize + 1)) + minLeafSize;
            if (splitH) {
                this.leftChild = new Leaf(this.x, this.y, this.w, split);
                this.rightChild = new Leaf(this.x, this.y + split, this.w, this.h - split);
            } else {
                this.leftChild = new Leaf(this.x, this.y, split, this.h);
                this.rightChild = new Leaf(this.x + split, this.y, this.w - split, this.h);
            }
            return true;
        }

        createRooms() {
            if (this.leftChild || this.rightChild) {
                if (this.leftChild) this.leftChild.createRooms();
                if (this.rightChild) this.rightChild.createRooms();
                if (this.leftChild && this.rightChild) {
                    this.createHall(this.leftChild.getRoom(), this.rightChild.getRoom());
                }
            } else {
                const roomW = Math.floor(random() * (this.w - 6)) + 5;
                const roomH = Math.floor(random() * (this.h - 6)) + 5;
                const roomX = Math.floor(random() * (this.w - roomW - 2)) + 1;
                const roomY = Math.floor(random() * (this.h - roomH - 2)) + 1;
                this.room = { x: this.x + roomX, y: this.y + roomY, w: roomW, h: roomH };
            }
        }

        getRoom() {
            if (this.room) return this.room;
            let lRoom = null;
            let rRoom = null;
            if (this.leftChild) lRoom = this.leftChild.getRoom();
            if (this.rightChild) rRoom = this.rightChild.getRoom();
            if (!lRoom && !rRoom) return null;
            if (!rRoom) return lRoom;
            if (!lRoom) return rRoom;
            return random() > 0.5 ? lRoom : rRoom;
        }

        createHall(l, r) {
            const pathW = 3;
            const point1 = { x: Math.floor(l.x + l.w / 2), y: Math.floor(l.y + l.h / 2) };
            const point2 = { x: Math.floor(r.x + r.w / 2), y: Math.floor(r.y + r.h / 2) };
            const w = point2.x - point1.x;
            const h = point2.y - point1.y;
            const pick = () => random() < 0.5;

            if (w < 0) {
                if (h < 0) {
                    if (pick()) {
                        this.halls.push({ x: point2.x, y: point1.y, w: Math.abs(w) + 1, h: pathW });
                        this.halls.push({ x: point2.x, y: point2.y, w: pathW, h: Math.abs(h) + 1 });
                    } else {
                        this.halls.push({ x: point2.x, y: point2.y, w: Math.abs(w) + 1, h: pathW });
                        this.halls.push({ x: point1.x, y: point2.y, w: pathW, h: Math.abs(h) + 1 });
                    }
                } else if (h > 0) {
                    if (pick()) {
                        this.halls.push({ x: point2.x, y: point1.y, w: Math.abs(w) + 1, h: pathW });
                        this.halls.push({ x: point2.x, y: point1.y, w: pathW, h: Math.abs(h) + 1 });
                    } else {
                        this.halls.push({ x: point2.x, y: point2.y, w: Math.abs(w) + 1, h: pathW });
                        this.halls.push({ x: point1.x, y: point1.y, w: pathW, h: Math.abs(h) + 1 });
                    }
                } else {
                    this.halls.push({ x: point2.x, y: point2.y, w: Math.abs(w) + 1, h: pathW });
                }
            } else if (w > 0) {
                if (h < 0) {
                    if (pick()) {
                        this.halls.push({ x: point1.x, y: point2.y, w: Math.abs(w) + 1, h: pathW });
                        this.halls.push({ x: point1.x, y: point2.y, w: pathW, h: Math.abs(h) + 1 });
                    } else {
                        this.halls.push({ x: point1.x, y: point1.y, w: Math.abs(w) + 1, h: pathW });
                        this.halls.push({ x: point2.x, y: point2.y, w: pathW, h: Math.abs(h) + 1 });
                    }
                } else if (h > 0) {
                    if (pick()) {
                        this.halls.push({ x: point1.x, y: point1.y, w: Math.abs(w) + 1, h: pathW });
                        this.halls.push({ x: point2.x, y: point1.y, w: pathW, h: Math.abs(h) + 1 });
                    } else {
                        this.halls.push({ x: point1.x, y: point2.y, w: Math.abs(w) + 1, h: pathW });
                        this.halls.push({ x: point1.x, y: point1.y, w: pathW, h: Math.abs(h) + 1 });
                    }
                } else {
                    this.halls.push({ x: point1.x, y: point1.y, w: Math.abs(w) + 1, h: pathW });
                }
            } else if (h < 0) {
                this.halls.push({ x: point2.x, y: point2.y, w: pathW, h: Math.abs(h) + 1 });
            } else if (h > 0) {
                this.halls.push({ x: point1.x, y: point1.y, w: pathW, h: Math.abs(h) + 1 });
            }
        }

        carveInto(grid, cols) {
            if (this.room) carveRect(grid, cols, this.room.x, this.room.y, this.room.w, this.room.h);
            for (const hall of this.halls) {
                carveRect(grid, cols, hall.x, hall.y, hall.w, hall.h);
            }
            if (this.leftChild) this.leftChild.carveInto(grid, cols);
            if (this.rightChild) this.rightChild.carveInto(grid, cols);
        }
    };
}

function runBsp(grid, cols, x, y, w, h, random) {
    const Leaf = createBspLeaf(random, 10);
    const root = new Leaf(x, y, w, h);
    const leaves = [root];
    let didSplit = true;
    while (didSplit) {
        didSplit = false;
        for (let i = 0; i < leaves.length; i++) {
            const leaf = leaves[i];
            if (leaf.leftChild || leaf.rightChild) continue;
            if (leaf.w > 24 || leaf.h > 18 || random() > 0.2) {
                if (leaf.split()) {
                    leaves.push(leaf.leftChild, leaf.rightChild);
                    didSplit = true;
                }
            }
        }
    }
    root.createRooms();
    root.carveInto(grid, cols);
}

function carveEntranceAndFoyer(grid, cols) {
    const half = Math.floor(ENTRANCE_WIDTH / 2);
    const southWallRow = BUILDING_ROWS - 1;
    for (let c = SPAWN_COL - half; c <= SPAWN_COL + half; c++) {
        for (let r = southWallRow; r >= Math.max(1, southWallRow - 10); r--) {
            grid[r * cols + c] = 0;
        }
    }
}

function carveGuardRoom(grid, cols) {
    carveRect(grid, cols, GUARD_ROOM.col, GUARD_ROOM.row, GUARD_ROOM.cols, GUARD_ROOM.rows);

    const roomSouthRow = GUARD_ROOM.row + GUARD_ROOM.rows;
    const foyerRow = BUILDING_ROWS - 1;
    for (let r = roomSouthRow; r <= foyerRow; r++) {
        for (let c = SPAWN_COL - 1; c <= SPAWN_COL + 1; c++) {
            grid[r * cols + c] = 0;
        }
    }
}

function carveYard(grid, cols) {
    if (YARD_ROWS > 0) {
        carveRect(grid, cols, 1, BUILDING_ROWS, GRID_COLS - 2, YARD_ROWS);
    }
    for (let c = 0; c < GRID_COLS; c++) {
        grid[(GRID_ROWS - 1) * cols + c] = 0;
    }
}

export function generateStartNodeBuilding(state, px, py) {
    const cellSize = state.flowFieldGrid.cellSize;
    const random = createRng(BSP_SEED);
    const grid = new Uint8Array(GRID_COLS * GRID_ROWS).fill(1);

    runBsp(grid, GRID_COLS, 1, 1, GRID_COLS - 2, BUILDING_ROWS - 2, random);
    carveEntranceAndFoyer(grid, GRID_COLS);
    carveGuardRoom(grid, GRID_COLS);
    carveYard(grid, GRID_COLS);

    const { offsetX, offsetY } = snapLayoutOrigin(px, py, GRID_COLS, GRID_ROWS, cellSize);

    for (let r = 0; r < GRID_ROWS; r++) {
        for (let c = 0; c < GRID_COLS; c++) {
            if (grid[r * GRID_COLS + c] !== 1) continue;
            state.walls.push(new Segment(
                offsetX + c * cellSize + cellSize / 2,
                offsetY + r * cellSize + cellSize / 2,
                0,
                cellSize,
                0,
            ));
        }
    }
}

export const StartBuildingStrategy = {
    generate(state, px, py) {
        generateStartNodeBuilding(state, px, py);
    },
};

export function getStartNodeLayout(px, py, cellSize) {
    const { offsetX, offsetY } = snapLayoutOrigin(px, py, GRID_COLS, GRID_ROWS, cellSize);
    const spawn = gridCellCenter(offsetX, offsetY, SPAWN_COL, SPAWN_ROW, cellSize);
    const guardRow = GUARD_ROOM.row + Math.floor(GUARD_ROOM.rows / 2);
    const guardLeftCol = GUARD_ROOM.col + 2;
    const guardRightCol = GUARD_ROOM.col + GUARD_ROOM.cols - 3;
    const guardLeft = gridCellCenter(offsetX, offsetY, guardLeftCol, guardRow, cellSize);
    const guardRight = gridCellCenter(offsetX, offsetY, guardRightCol, guardRow, cellSize);
    const guardFace = gridCellCenter(offsetX, offsetY, SPAWN_COL, BUILDING_ROWS - 1, cellSize);

    return {
        minX: offsetX,
        minY: offsetY,
        maxX: offsetX + GRID_COLS * cellSize,
        maxY: offsetY + GRID_ROWS * cellSize,
        spawnX: spawn.x,
        spawnY: spawn.y,
        spawnClearRadius: 48,
        guardFaceX: guardFace.x,
        guardFaceY: guardFace.y,
        guardSpawns: [guardLeft, guardRight],
    };
}
