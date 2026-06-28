const EDGE_STRIDE = 7;
export class EdgeList {
    constructor(initialCapacity = 64) {
        this.data = new Float32Array(initialCapacity * EDGE_STRIDE);
        this.length = 0;
    }
    clear() {
        this.length = 0;
    }
    add(x1, y1, x2, y2, nx, ny, wallTopZ) {
        const i = this.length;
        const base = i * EDGE_STRIDE;
        if (base + EDGE_STRIDE > this.data.length) {
            const next = new Float32Array(Math.max(this.data.length * 2, base + EDGE_STRIDE));
            next.set(this.data);
            this.data = next;
        }
        this.data[base] = x1;
        this.data[base + 1] = y1;
        this.data[base + 2] = x2;
        this.data[base + 3] = y2;
        this.data[base + 4] = nx;
        this.data[base + 5] = ny;
        this.data[base + 6] = wallTopZ;
        this.length++;
    }
}
export { EDGE_STRIDE };
