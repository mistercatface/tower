import { colRowToIndex } from "../Spatial/grid/GridUtils.js";
import { cellEdgeSlotOffset } from "../Spatial/grid/cellEdgeSlots.js";
import { isFloorBeltKind } from "../Spatial/grid/FloorCell.js";
/**
 * Minimal grid shape for nav topology bake (main packs SABs; worker reads this view).
 * @param {Uint8Array} gridFill
 * @param {Uint8Array} floorKind
 * @param {Uint8Array} floorFacing
 * @param {Int32Array} edgeSlots
 * @param {object[]} edgePool
 * @param {Uint8Array} vertexPassability
 */
export function createNavSimView(cols, rows, gridFill, floorKind, floorFacing, edgeSlots, edgePool, passageEdgeCount, vertexPassability, minX, minY, cellSize) {
    const edgeStore = {
        passageEdgeCount,
        slots: edgeSlots,
        pool: edgePool,
        get(col, row, side, c) {
            const ref = edgeSlots[cellEdgeSlotOffset(colRowToIndex(col, row, c), side)];
            if (ref < 0) return null;
            return edgeStore.pool[ref];
        },
    };
    return {
        cols,
        rows,
        minX,
        minY,
        cellSize,
        grid: gridFill,
        vertexPassability,
        edgeStore,
        floorStore: {
            kind: floorKind,
            facing: floorFacing,
            isBeltKindAtIdx(idx) {
                return isFloorBeltKind(floorKind[idx]);
            },
        },
        isBlocked(col, row) {
            return gridFill[colRowToIndex(col, row, cols)] !== 0;
        },
    };
}
/** @param {ReturnType<typeof createNavSimView>} simView @param {object[]} edgePool @param {number} passageEdgeCount */
export function bindNavSimEdgePool(simView, edgePool, passageEdgeCount) {
    simView.edgeStore.pool = edgePool;
    simView.edgeStore.passageEdgeCount = passageEdgeCount;
}
/** @param {ReturnType<typeof createNavSimView>} simView @param {number} minX @param {number} minY @param {number} cellSize */
export function bindNavSimGridFrame(simView, minX, minY, cellSize) {
    simView.minX = minX;
    simView.minY = minY;
    simView.cellSize = cellSize;
}
