export class FlatGridView {
    constructor(cols, rows, { blocked = null, neighborLayout = null, flowToNavIdx = null, canStep = null } = {}) {
        this.cols = cols;
        this.rows = rows;
        this.cellCount = cols * rows;
        this.blocked = blocked;
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
        const cols = this.cols;
        return { col: idx % cols, row: (idx / cols) | 0 };
    }
    canStep(idx0, idx1) {
        if (idx0 < 0 || idx0 >= this.cellCount || idx1 < 0 || idx1 >= this.cellCount) return false;
        const cols = this.cols;
        const col0 = idx0 % cols;
        const col1 = idx1 % cols;
        if (Math.abs(col0 - col1) > 1) return false; // Boundary horizontal wrap check
        if (this._canStep) return this._canStep(col0, (idx0 / cols) | 0, col1, (idx1 / cols) | 0);
        if (this.blocked) return !this.blocked[idx1];
        return true;
    }
    canStepIdx(idx0, idx1) {
        return this.canStep(idx0, idx1);
    }
}
