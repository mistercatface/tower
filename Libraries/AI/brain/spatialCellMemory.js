import { LruMap } from "../../DataStructures/LruMap.js";
import { packCellKey, unpackCellKey } from "../../DataStructures/CellKey.js";
export function createSpatialCellMemory({ capacity = 64 } = {}) {
    const entries = new LruMap(capacity);
    let stampSeq = 0;
    const keyFor = (col, row) => packCellKey(col, row);
    const stamp = (col, row) => {
        entries.set(keyFor(col, row), stampSeq++);
    };
    return {
        capacity,
        stamp,
        stampCells(cells) {
            for (let i = 0; i < cells.length; i++) {
                const cell = cells[i];
                stamp(cell.col, cell.row);
            }
        },
        has(col, row) {
            return entries.has(keyFor(col, row));
        },
        clear() {
            entries.clear();
            stampSeq = 0;
        },
        get size() {
            return entries.size;
        },
        forEachNewestFirst(fn) {
            const keys = [...entries.keys()];
            for (let i = keys.length - 1; i >= 0; i--) {
                const { col, row } = unpackCellKey(keys[i]);
                fn(col, row, entries.peek(keys[i]), keys.length - 1 - i);
            }
        },
        forEachOldestFirst(fn) {
            for (const key of entries.keys()) {
                const { col, row } = unpackCellKey(key);
                fn(col, row, entries.peek(key));
            }
        },
    };
}
