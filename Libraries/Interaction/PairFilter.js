import { pairFilterAllows } from "./pairRules.js";

/** @typedef {import("./pairRules.js").PairFilterConfig} PairFilterConfig */

export class PairFilter {
    /** @param {PairFilterConfig} config */
    constructor(config) {
        this.config = config;
    }

    /** @param {object} self @param {object} other */
    allows(self, other) {
        return pairFilterAllows(this.config, self, other);
    }
}
