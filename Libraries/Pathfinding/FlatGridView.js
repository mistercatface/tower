export class FlatGridView {
    constructor(cols, rows, { blocked = null, neighborLayout = null, flowToNavIdx = null, canStep = null } = {}) {
        this.cols = cols;
        this.rows = rows;
        this.cellCount = cols * rows;
        this.blocked = blocked;
        this.neighborLayout = neighborLayout;
        this.flowToNavIdx = flowToNavIdx;
        this._canStep = canStep;
        this.gridIdx = new Int16Array(this.cellCount * 2);
        for (let i = 0; i < this.cellCount; i++) {
            this.gridIdx[i * 2] = i % cols;
            this.gridIdx[i * 2 + 1] = (i / cols) | 0;
        }
    }
    idx(col, row) {
        return row * this.cols + col;
    }
    contains(col, row) {
        return col >= 0 && col < this.cols && row >= 0 && row < this.rows;
    }
    cell(idx) {
        const base = idx * 2;
        return { col: this.gridIdx[base], row: this.gridIdx[base + 1] };
    }
    canStep(idx0, idx1) {
        if (idx0 < 0 || idx0 >= this.cellCount || idx1 < 0 || idx1 >= this.cellCount) return false;
        const cols = this.cols;
        const col0 = this.gridIdx[idx0 * 2];
        const col1 = this.gridIdx[idx1 * 2];
        if (Math.abs(col0 - col1) > 1) return false; // Boundary horizontal wrap check
        if (this._canStep) return this._canStep(col0, this.gridIdx[idx0 * 2 + 1], col1, this.gridIdx[idx1 * 2 + 1]);
        if (this.blocked) return !this.blocked[idx1];
        return true;
    }
}
