/**
 * A lightweight view for index-first grid work.
 * Groups dimensions, bounds checks, index conversion, and attached buffers.
 */
export class FlatGridView {
    constructor(cols, rows, { blocked = null, neighbors = null, neighborLayout = null, flowToNavIdx = null, canStep = null } = {}) {
        this.cols = cols;
        this.rows = rows;
        this.cellCount = cols * rows;
        this.blocked = blocked;
        this.neighbors = neighbors;
        this.neighborLayout = neighborLayout;
        this.flowToNavIdx = flowToNavIdx;
        this._canStep = canStep;
    }
    idx(col, row) {
        return row * this.cols + col;
    }
    contains(col, row) {
        return col >= 0 && col < this.cols && row >= 0 && row < this.rows;
    }
    cell(idx) {
        return { col: idx % this.cols, row: (idx / this.cols) | 0 };
    }
    canStep(c0, r0, c1, r1) {
        if (this._canStep) return this._canStep(c0, r0, c1, r1);
        if (this.blocked) return !this.blocked[this.idx(c1, r1)];
        return true;
    }
}
