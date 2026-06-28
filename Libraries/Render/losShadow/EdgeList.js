export class EdgeList {
    constructor() {
        this.edges = [];
        this.length = 0;
    }
    clear() {
        this.length = 0;
    }
    add(x1, y1, x2, y2, nx, ny, wallTopZ) {
        let edge;
        if (this.length < this.edges.length) edge = this.edges[this.length];
        else {
            edge = { x1: 0, y1: 0, x2: 0, y2: 0, nx: 0, ny: 0, wallTopZ: 0 };
            this.edges.push(edge);
        }
        edge.x1 = x1;
        edge.y1 = y1;
        edge.x2 = x2;
        edge.y2 = y2;
        edge.nx = nx;
        edge.ny = ny;
        edge.wallTopZ = wallTopZ;
        this.length++;
    }
}
