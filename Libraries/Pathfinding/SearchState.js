export class SearchState {
    constructor(size) {
        this.gScore = new Float32Array(size);
        this.cameFrom = new Int32Array(size);
        this.visited = new Int32Array(size);
        this.runId = 0;
    }
    prepare() {
        this.runId++;
        return this;
    }
    resize(size) {
        if (this.gScore.length !== size) {
            this.gScore = new Float32Array(size);
            this.cameFrom = new Int32Array(size);
            this.visited = new Int32Array(size);
            this.runId = 0;
        }
    }
}
