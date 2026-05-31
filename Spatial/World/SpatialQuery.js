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
        const gen = this.generation;
        hash._forEachInBounds(bounds, (entity) => {
            if (entity === exclude || entity._spatialGen === gen) {
                return;
            }
            entity._spatialGen = gen;
            fn(entity);
        });
    }

    collectInHash(hash, bounds, exclude = null) {
        this._scratch.length = 0;
        this.forEachInHash(hash, bounds, (entity) => {
            this._scratch.push(entity);
        }, exclude);
        return this._scratch;
    }
}
