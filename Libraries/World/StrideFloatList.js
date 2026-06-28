export class StrideFloatList {
    constructor(stride, initialCapacity = 256) {
        this.stride = stride;
        this.data = new Float32Array(initialCapacity * stride);
        this.length = 0;
    }
    clear() {
        this.length = 0;
    }
    ensureCapacity(capacity) {
        if (this.data.length >= capacity * this.stride) return;
        const nextCapacity = Math.max(this.data.length * 2, capacity * this.stride);
        const nextData = new Float32Array(nextCapacity);
        nextData.set(this.data);
        this.data = nextData;
    }
}
