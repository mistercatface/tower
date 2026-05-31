export class MinHeap {
    constructor(compare) {
        this.data = [];
        this.compare = compare;
    }

    push(val) {
        this.data.push(val);
        this.up(this.data.length - 1);
    }

    pop() {
        if (this.data.length === 0) return null;
        const top = this.data[0];
        const bottom = this.data.pop();
        if (this.data.length > 0) {
            this.data[0] = bottom;
            this.down(0);
        }
        return top;
    }

    up(i) {
        while (i > 0) {
            const p = (i - 1) >> 1;
            if (this.compare(this.data[i], this.data[p]) < 0) {
                const tmp = this.data[i];
                this.data[i] = this.data[p];
                this.data[p] = tmp;
                i = p;
            } else {
                break;
            }
        }
    }

    down(i) {
        const len = this.data.length;
        while ((i << 1) + 1 < len) {
            let left = (i << 1) + 1;
            let right = left + 1;
            let best = left;
            if (right < len && this.compare(this.data[right], this.data[left]) < 0) {
                best = right;
            }
            if (this.compare(this.data[best], this.data[i]) < 0) {
                const tmp = this.data[i];
                this.data[i] = this.data[best];
                this.data[best] = tmp;
                i = best;
            } else {
                break;
            }
        }
    }

    get size() {
        return this.data.length;
    }
}

export class IdxMinHeap {
    constructor() {
        this.idx = [];
        this.f = [];
        this.top = { idx: 0, f: 0 };
    }

    push(idx, f) {
        this.idx.push(idx);
        this.f.push(f);
        this.up(this.idx.length - 1);
    }

    pop() {
        const top = this.top;
        top.idx = this.idx[0];
        top.f = this.f[0];
        const len = this.idx.length;
        if (len === 1) {
            this.idx.pop();
            this.f.pop();
            return top;
        }
        this.idx[0] = this.idx.pop();
        this.f[0] = this.f.pop();
        this.down(0);
        return top;
    }

    up(i) {
        const idxArr = this.idx;
        const fArr = this.f;
        while (i > 0) {
            const p = (i - 1) >> 1;
            if (fArr[i] < fArr[p]) {
                const tmpIdx = idxArr[i];
                idxArr[i] = idxArr[p];
                idxArr[p] = tmpIdx;
                const tmpF = fArr[i];
                fArr[i] = fArr[p];
                fArr[p] = tmpF;
                i = p;
            } else {
                break;
            }
        }
    }

    down(i) {
        const idxArr = this.idx;
        const fArr = this.f;
        const len = idxArr.length;
        while ((i << 1) + 1 < len) {
            const left = (i << 1) + 1;
            const right = left + 1;
            let best = left;
            if (right < len && fArr[right] < fArr[left]) {
                best = right;
            }
            if (fArr[best] < fArr[i]) {
                const tmpIdx = idxArr[i];
                idxArr[i] = idxArr[best];
                idxArr[best] = tmpIdx;
                const tmpF = fArr[i];
                fArr[i] = fArr[best];
                fArr[best] = tmpF;
                i = best;
            } else {
                break;
            }
        }
    }

    get size() {
        return this.idx.length;
    }
}
