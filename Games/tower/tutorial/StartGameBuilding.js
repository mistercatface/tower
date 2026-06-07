import { Segment } from "../../../Entities/Wall.js";
import { snapLayoutOrigin, gridCellCenter } from "../../../Generator/GridLayout.js";
import { startLayoutConfig } from "../config/startLayout.js";
const { grid, guardRoom, centerCol, spawnSlots, guardFace, spawnClearRadius } = startLayoutConfig;
const GRID_COLS = grid.cols;
const BUILDING_ROWS = grid.buildingRows;
const ENTRANCE_ROW = BUILDING_ROWS - 1;
const YARD_ROWS = grid.spawnSouthOfEntrance + grid.yardRowsPadding;
const GRID_ROWS = BUILDING_ROWS + YARD_ROWS;
const ENTRANCE_WIDTH = grid.entranceWidth;
const BSP_SEED = grid.bspSeed;
const GUARD_ROOM = guardRoom;
const SPAWN_COL = centerCol;
function createRng(seed) {
    let s = seed >>> 0;
    return () => {
        s = (s * 1664525 + 1013904223) >>> 0;
        return s / 0x100000000;
    };
}
function carveRect(gridBuf, cols, x, y, w, h) {
    for (let r = y; r < y + h; r++) for (let c = x; c < x + w; c++) if (r >= 0 && r < GRID_ROWS && c >= 0 && c < GRID_COLS) gridBuf[r * cols + c] = 0;
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
                if (this.leftChild && this.rightChild) this.createHall(this.leftChild.getRoom(), this.rightChild.getRoom());
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
            if (w < 0)
                if (h < 0)
                    if (pick()) {
                        this.halls.push({ x: point2.x, y: point1.y, w: Math.abs(w) + 1, h: pathW });
                        this.halls.push({ x: point2.x, y: point2.y, w: pathW, h: Math.abs(h) + 1 });
                    } else {
                        this.halls.push({ x: point2.x, y: point2.y, w: Math.abs(w) + 1, h: pathW });
                        this.halls.push({ x: point1.x, y: point2.y, w: pathW, h: Math.abs(h) + 1 });
                    }
                else if (h > 0)
                    if (pick()) {
                        this.halls.push({ x: point2.x, y: point1.y, w: Math.abs(w) + 1, h: pathW });
                        this.halls.push({ x: point2.x, y: point1.y, w: pathW, h: Math.abs(h) + 1 });
                    } else {
                        this.halls.push({ x: point2.x, y: point2.y, w: Math.abs(w) + 1, h: pathW });
                        this.halls.push({ x: point1.x, y: point1.y, w: pathW, h: Math.abs(h) + 1 });
                    }
                else this.halls.push({ x: point2.x, y: point2.y, w: Math.abs(w) + 1, h: pathW });
            else if (w > 0)
                if (h < 0)
                    if (pick()) {
                        this.halls.push({ x: point1.x, y: point2.y, w: Math.abs(w) + 1, h: pathW });
                        this.halls.push({ x: point1.x, y: point2.y, w: pathW, h: Math.abs(h) + 1 });
                    } else {
                        this.halls.push({ x: point1.x, y: point1.y, w: Math.abs(w) + 1, h: pathW });
                        this.halls.push({ x: point2.x, y: point2.y, w: pathW, h: Math.abs(h) + 1 });
                    }
                else if (h > 0)
                    if (pick()) {
                        this.halls.push({ x: point1.x, y: point1.y, w: Math.abs(w) + 1, h: pathW });
                        this.halls.push({ x: point2.x, y: point1.y, w: pathW, h: Math.abs(h) + 1 });
                    } else {
                        this.halls.push({ x: point1.x, y: point2.y, w: Math.abs(w) + 1, h: pathW });
                        this.halls.push({ x: point1.x, y: point1.y, w: pathW, h: Math.abs(h) + 1 });
                    }
                else this.halls.push({ x: point1.x, y: point1.y, w: Math.abs(w) + 1, h: pathW });
            else if (h < 0) this.halls.push({ x: point2.x, y: point2.y, w: pathW, h: Math.abs(h) + 1 });
            else if (h > 0) this.halls.push({ x: point1.x, y: point1.y, w: pathW, h: Math.abs(h) + 1 });
        }
        carveInto(gridBuf, cols) {
            if (this.room) carveRect(gridBuf, cols, this.room.x, this.room.y, this.room.w, this.room.h);
            for (const hall of this.halls) carveRect(gridBuf, cols, hall.x, hall.y, hall.w, hall.h);
            if (this.leftChild) this.leftChild.carveInto(gridBuf, cols);
            if (this.rightChild) this.rightChild.carveInto(gridBuf, cols);
        }
    };
}
function runBsp(gridBuf, cols, x, y, w, h, random) {
    const Leaf = createBspLeaf(random, 10);
    const root = new Leaf(x, y, w, h);
    const leaves = [root];
    let didSplit = true;
    while (didSplit) {
        didSplit = false;
        for (let i = 0; i < leaves.length; i++) {
            const leaf = leaves[i];
            if (leaf.leftChild || leaf.rightChild) continue;
            if (leaf.w > 24 || leaf.h > 18 || random() > 0.2)
                if (leaf.split()) {
                    leaves.push(leaf.leftChild, leaf.rightChild);
                    didSplit = true;
                }
        }
    }
    root.createRooms();
    root.carveInto(gridBuf, cols);
}
function carveEntranceAndFoyer(gridBuf, cols) {
    const half = Math.floor(ENTRANCE_WIDTH / 2);
    const southWallRow = BUILDING_ROWS - 1;
    for (let c = SPAWN_COL - half; c <= SPAWN_COL + half; c++) for (let r = southWallRow; r >= Math.max(1, southWallRow - 10); r--) gridBuf[r * cols + c] = 0;
}
function carveNorthExit(gridBuf, cols) {
    const half = Math.floor(ENTRANCE_WIDTH / 2);
    for (let c = SPAWN_COL - half; c <= SPAWN_COL + half; c++) for (let r = 0; r <= 10; r++) gridBuf[r * cols + c] = 0;
}
function carveGuardRoom(gridBuf, cols) {
    carveRect(gridBuf, cols, GUARD_ROOM.col, GUARD_ROOM.row, GUARD_ROOM.cols, GUARD_ROOM.rows);
    const roomSouthRow = GUARD_ROOM.row + GUARD_ROOM.rows;
    const foyerRow = BUILDING_ROWS - 1;
    for (let r = roomSouthRow; r <= foyerRow; r++) for (let c = SPAWN_COL - 1; c <= SPAWN_COL + 1; c++) gridBuf[r * cols + c] = 0;
}
function carveYard(gridBuf, cols) {
    if (YARD_ROWS > 0) carveRect(gridBuf, cols, 1, BUILDING_ROWS, GRID_COLS - 2, YARD_ROWS);
    for (let c = 0; c < GRID_COLS; c++) gridBuf[(GRID_ROWS - 1) * cols + c] = 0;
}
function resolveWorldSpawnSlots(offsetX, offsetY, cellSize) {
    /** @type {Record<string, { x: number, y: number }>} */
    const worldSlots = {};
    for (const [name, cell] of Object.entries(spawnSlots)) worldSlots[name] = gridCellCenter(offsetX, offsetY, cell.col, cell.row, cellSize);
    return worldSlots;
}
export function generateStartGameBuilding(state, px, py) {
    const cellSize = state.flowFieldGrid.cellSize;
    const random = createRng(BSP_SEED);
    const gridBuf = new Uint8Array(GRID_COLS * GRID_ROWS).fill(1);
    runBsp(gridBuf, GRID_COLS, 1, 1, GRID_COLS - 2, BUILDING_ROWS - 2, random);
    carveEntranceAndFoyer(gridBuf, GRID_COLS);
    carveNorthExit(gridBuf, GRID_COLS);
    carveGuardRoom(gridBuf, GRID_COLS);
    carveYard(gridBuf, GRID_COLS);
    const { offsetX, offsetY } = snapLayoutOrigin(px, py, GRID_COLS, GRID_ROWS, cellSize);
    for (let r = 0; r < GRID_ROWS; r++)
        for (let c = 0; c < GRID_COLS; c++) {
            if (gridBuf[r * GRID_COLS + c] !== 1) continue;
            state.walls.push(new Segment(offsetX + c * cellSize + cellSize / 2, offsetY + r * cellSize + cellSize / 2, 0, cellSize, 0));
        }
}
export function getStartGameLayout(px, py, cellSize) {
    const { offsetX, offsetY } = snapLayoutOrigin(px, py, GRID_COLS, GRID_ROWS, cellSize);
    const worldSpawnSlots = resolveWorldSpawnSlots(offsetX, offsetY, cellSize);
    const yardSpawn = worldSpawnSlots.yard;
    const guardFaceWorld = gridCellCenter(offsetX, offsetY, guardFace.col, guardFace.row, cellSize);
    return {
        minX: offsetX,
        minY: offsetY,
        maxX: offsetX + GRID_COLS * cellSize,
        maxY: offsetY + GRID_ROWS * cellSize,
        spawnX: yardSpawn.x,
        spawnY: yardSpawn.y,
        spawnClearRadius,
        guardFaceX: guardFaceWorld.x,
        guardFaceY: guardFaceWorld.y,
        spawnSlots: worldSpawnSlots,
    };
}
