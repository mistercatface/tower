import { colRowToIndex } from "../Spatial/grid/GridUtils.js";
import { cellEdgeSlotOffset } from "../Spatial/grid/cellEdgeSlots.js";
import { isFloorBeltKind } from "../Spatial/grid/FloorCell.js";
/**
 * Minimal grid shape for nav topology bake (main packs SABs; worker reads this view).
 * @param {import("./GridNavSnapshot.js").GridFrame} frame
 * @param {Uint8Array} gridFill
 * @param {Uint8Array} floorKind
 * @param {Uint8Array} floorFacing
 * @param {Int32Array} edgeSlots
 * @param {object[]} edgePool
 * @param {Uint8Array} vertexPassability
 */
export function createNavSimView(frame, gridFill, floorKind, floorFacing, edgeSlots, edgePool, passageEdgeCount, vertexPassability) {
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
    const simView = {
        frame,
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
            return gridFill[colRowToIndex(col, row, frame.cols)] !== 0;
        },
    };
    Object.defineProperties(simView, {
        cols: {
            get() {
                return frame.cols;
            },
            enumerable: true,
        },
        rows: {
            get() {
                return frame.rows;
            },
            enumerable: true,
        },
        minX: {
            get() {
                return frame.minX;
            },
            enumerable: true,
        },
        minY: {
            get() {
                return frame.minY;
            },
            enumerable: true,
        },
        cellSize: {
            get() {
                return frame.cellSize;
            },
            enumerable: true,
        },
    });
    return simView;
}
/** @param {ReturnType<typeof createNavSimView>} simView @param {object[]} edgePool @param {number} passageEdgeCount */
export function bindNavSimEdgePool(simView, edgePool, passageEdgeCount) {
    simView.edgeStore.pool = edgePool;
    simView.edgeStore.passageEdgeCount = passageEdgeCount;
}
/** @param {ReturnType<typeof createNavSimView>} simView @param {import("./GridNavSnapshot.js").GridFrame} frame */
export function bindNavSimGridFrame(simView, frame) {
    simView.frame = frame;
}
