import { cellEdgeSlotOffset } from "../Spatial/spatial.js";
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
export function createNavSimView(frame, gridFill, floorKind, floorFacing, edgeSlots, edgePool, vertexPassability) {
    const simView = {
        frame,
        grid: gridFill,
        vertexPassability,
        cellEdgeSlots: edgeSlots,
        cellEdgePool: edgePool,
        floorKind: floorKind,
        floorFacing: floorFacing,
        getCellEdge(idx, side) {
            const ref = edgeSlots[cellEdgeSlotOffset(idx, side)];
            if (ref < 0) return null;
            return simView.cellEdgePool[ref];
        },
        hasAnyCellEdgeAtIdx(idx) {
            const base = idx << 2;
            return edgeSlots[base] !== -1 || edgeSlots[base + 1] !== -1 || edgeSlots[base + 2] !== -1 || edgeSlots[base + 3] !== -1;
        },
        isBlocked(col, row) {
            return gridFill[row * frame.cols + col] !== 0;
        },
        isBlockedIdx(idx) {
            if (idx < 0 || idx >= gridFill.length) return true;
            return gridFill[idx] !== 0;
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
/** @param {ReturnType<typeof createNavSimView>} simView @param {object[]} edgePool */
export function bindNavSimEdgePool(simView, edgePool) {
    simView.cellEdgePool = edgePool;
}
/** @param {ReturnType<typeof createNavSimView>} simView @param {import("./GridNavSnapshot.js").GridFrame} frame */
export function bindNavSimGridFrame(simView, frame) {
    simView.frame = frame;
}
