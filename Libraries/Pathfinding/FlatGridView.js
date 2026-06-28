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
        if (Math.abs((idx0 % cols) - (idx1 % cols)) > 1) return false; // Boundary horizontal wrap check
        if (this._canStep) return this._canStep(idx0, idx1);
        if (this.blocked) return !this.blocked[idx1];
        return true;
    }
}
