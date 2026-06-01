export class SpatialQuery {
    constructor() {
        this.generation = 0;
        this._scratch = [];
        this._collectFn = (entity) => {
            this._scratch.push(entity);
        };
    }

    nextQuery() {
        this.generation = (this.generation + 1) | 0;
        if (this.generation === 0) {
            this.generation = 1;
        }
    }

    forEachInHashCoords(hash, minX, minY, maxX, maxY, fn, exclude = null) {
        this.nextQuery();
        hash.forEachInBoundsCoords(minX, minY, maxX, maxY, exclude, this.generation, fn);
    }

    collectInHashCoords(hash, minX, minY, maxX, maxY, exclude = null) {
        this._scratch.length = 0;
        this.forEachInHashCoords(hash, minX, minY, maxX, maxY, this._collectFn, exclude);
        return this._scratch;
    }

    forEachInHash(hash, bounds, fn, exclude = null) {
        this.forEachInHashCoords(hash, bounds.minX, bounds.minY, bounds.maxX, bounds.maxY, fn, exclude);
    }

    collectInHash(hash, bounds, exclude = null) {
        return this.collectInHashCoords(hash, bounds.minX, bounds.minY, bounds.maxX, bounds.maxY, exclude);
    }
}
