export const DRAW_KIND_PROP = 1;
export const DRAW_KIND_VOXEL = 3;
export const DRAW_KIND_RAIL = 4;
function parallelInsertionSort(kinds, baseIndices, depths, refs, start, end) {
    for (let i = start + 1; i <= end; i++) {
        const keyKind = kinds[i];
        const keyBaseIndex = baseIndices[i];
        const keyDepth = depths[i];
        const keyRef = refs[i];
        let j = i - 1;
        while (j >= start && depths[j] < keyDepth) {
            kinds[j + 1] = kinds[j];
            baseIndices[j + 1] = baseIndices[j];
            depths[j + 1] = depths[j];
            refs[j + 1] = refs[j];
            j--;
        }
        kinds[j + 1] = keyKind;
        baseIndices[j + 1] = keyBaseIndex;
        depths[j + 1] = keyDepth;
        refs[j + 1] = keyRef;
    }
}
function heapify(kinds, baseIndices, depths, refs, n, i) {
    let root = i;
    while (true) {
        let smallest = root;
        const left = 2 * root + 1;
        const right = 2 * root + 2;
        if (left < n && depths[left] < depths[smallest]) smallest = left;
        if (right < n && depths[right] < depths[smallest]) smallest = right;
        if (smallest === root) break;
        const tempKind = kinds[root];
        kinds[root] = kinds[smallest];
        kinds[smallest] = tempKind;
        const tempBaseIndex = baseIndices[root];
        baseIndices[root] = baseIndices[smallest];
        baseIndices[smallest] = tempBaseIndex;
        const tempDepth = depths[root];
        depths[root] = depths[smallest];
        depths[smallest] = tempDepth;
        const tempRef = refs[root];
        refs[root] = refs[smallest];
        refs[smallest] = tempRef;
        root = smallest;
    }
}
function parallelHeapSort(kinds, baseIndices, depths, refs, n) {
    for (let i = Math.floor(n / 2) - 1; i >= 0; i--) heapify(kinds, baseIndices, depths, refs, n, i);
    for (let i = n - 1; i > 0; i--) {
        const tempKind = kinds[0];
        kinds[0] = kinds[i];
        kinds[i] = tempKind;
        const tempBaseIndex = baseIndices[0];
        baseIndices[0] = baseIndices[i];
        baseIndices[i] = tempBaseIndex;
        const tempDepth = depths[0];
        depths[0] = depths[i];
        depths[i] = tempDepth;
        const tempRef = refs[0];
        refs[0] = refs[i];
        refs[i] = tempRef;
        heapify(kinds, baseIndices, depths, refs, i, 0);
    }
}
export class VisibleDrawQueue {
    constructor(initialCapacity = 1024) {
        this.length = 0;
        this.kinds = new Uint8Array(initialCapacity);
        this.baseIndices = new Int32Array(initialCapacity);
        this.depths = new Float32Array(initialCapacity);
        this.refs = new Array(initialCapacity);
    }
    clear() {
        this.length = 0;
    }
    ensureCapacity(count) {
        if (this.kinds.length >= count) return;
        const nextCapacity = Math.max(this.kinds.length * 2, count);
        const nextKinds = new Uint8Array(nextCapacity);
        nextKinds.set(this.kinds);
        this.kinds = nextKinds;
        const nextBaseIndices = new Int32Array(nextCapacity);
        nextBaseIndices.set(this.baseIndices);
        this.baseIndices = nextBaseIndices;
        const nextDepths = new Float32Array(nextCapacity);
        nextDepths.set(this.depths);
        this.depths = nextDepths;
        this.refs.length = nextCapacity;
    }
    push(kind, baseIndex, ref, distSq) {
        this.ensureCapacity(this.length + 1);
        const i = this.length;
        this.kinds[i] = kind;
        this.baseIndices[i] = baseIndex;
        this.depths[i] = distSq;
        this.refs[i] = ref;
        this.length++;
    }
    sort() {
        const n = this.length;
        if (n <= 1) return;
        if (n <= 32) parallelInsertionSort(this.kinds, this.baseIndices, this.depths, this.refs, 0, n - 1);
        else parallelHeapSort(this.kinds, this.baseIndices, this.depths, this.refs, n);
    }
}
