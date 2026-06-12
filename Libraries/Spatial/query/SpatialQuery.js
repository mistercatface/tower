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
    /** @param {{ forEachInBounds: Function }} index @param {import("../../Math/Aabb2D.js").Aabb2D} bounds @param {(entity: object) => void} fn @param {object | null} [exclude] */
    forEachInIndex(index, bounds, fn, exclude = null) {
        this.nextQuery();
        index.forEachInBounds(bounds, exclude, this.generation, fn);
    }
    /** @param {{ forEachInBounds: Function }} index @param {import("../../Math/Aabb2D.js").Aabb2D} bounds @param {object | null} [exclude] @returns {object[]} */
    collectInIndex(index, bounds, exclude = null) {
        this._scratch.length = 0;
        this.forEachInIndex(index, bounds, this._collectFn, exclude);
        return this._scratch;
    }
}
