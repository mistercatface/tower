import { compilePairFilter } from "./pairRules.js";

/** @typedef {import("./pairRules.js").PairFilterConfig} PairFilterConfig */

export class PairFilter {
    /** @param {PairFilterConfig} config */
    constructor(config) {
        this.config = config;
        this._allows = compilePairFilter(config);
    }

    /** @param {object} self @param {object} other */
    allows(self, other) {
        return this._allows(self, other);
    }
}
