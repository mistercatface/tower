export class SpatialQuery {
    constructor() {
        this.generation = 0;
        this._scratch = [];
    }

    nextQuery() {
        this.generation = (this.generation + 1) | 0;
        if (this.generation === 0) {
            this.generation = 1;
        }
    }

    forEachInHash(hash, bounds, fn, exclude = null) {
        this.nextQuery();
        hash.forEachInBounds(bounds, exclude, this.generation, fn);
    }

    collectInHash(hash, bounds, exclude = null) {
        this._scratch.length = 0;
        this.forEachInHash(hash, bounds, (entity) => {
            this._scratch.push(entity);
        }, exclude);
        return this._scratch;
    }
}
