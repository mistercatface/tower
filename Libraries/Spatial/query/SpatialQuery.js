let globalGeneration = 0;

export class SpatialQuery {
    constructor() {
        this.generation = 0;
        this._scratch = [];
        this._collectFn = (entity) => {
            this._scratch.push(entity);
        };
    }
    nextQuery() {
        globalGeneration = (globalGeneration + 1) | 0;
        if (globalGeneration === 0) globalGeneration = 1;
        this.generation = globalGeneration;
    }
    forEachInIndexCoords(index, minX, minY, maxX, maxY, fn, exclude = null) {
        this.nextQuery();
        index.forEachInBoundsCoords(minX, minY, maxX, maxY, exclude, this.generation, fn);
    }
    collectInIndexCoords(index, minX, minY, maxX, maxY, exclude = null) {
        this._scratch.length = 0;
        this.forEachInIndexCoords(index, minX, minY, maxX, maxY, this._collectFn, exclude);
        return this._scratch;
    }
    forEachInIndex(index, bounds, fn, exclude = null) {
        this.forEachInIndexCoords(index, bounds.minX, bounds.minY, bounds.maxX, bounds.maxY, fn, exclude);
    }
    collectInIndex(index, bounds, exclude = null) {
        return this.collectInIndexCoords(index, bounds.minX, bounds.minY, bounds.maxX, bounds.maxY, exclude);
    }
}
