import { NEIGHBOR_QUERY_PAD } from "../Spatial/collision/entityBroadphase.js";
import { PairFilter } from "../Interaction/PairFilter.js";
import { COMBAT_SEPARATION } from "../../Games/tower/presets/combat.js";
import {
    accumulateSeparationFromPair,
    clampSeparationAccum,
    createSeparationAccum,
} from "./separationForce.js";

/** @typedef {import("../Interaction/pairRules.js").PairFilterConfig} PairFilterConfig */

export class SeparationEngine {
    /**
     * @param {PairFilterConfig | PairFilter} [config]
     */
    constructor(config = COMBAT_SEPARATION) {
        this.filter = config instanceof PairFilter ? config : new PairFilter(config);
        this.neighborPad = config instanceof PairFilter
            ? (config.config.neighborPad ?? NEIGHBOR_QUERY_PAD)
            : (config.neighborPad ?? NEIGHBOR_QUERY_PAD);
    }

    /**
     * @param {{ x: number, y: number, radius: number }} self
     * @param {object} other
     */
    shouldSeparate(self, other) {
        return this.filter.allows(self, other);
    }

    /**
     * @param {{ x: number, y: number, radius: number }} self
     * @param {object[]} neighbors
     * @returns {{ x: number, y: number, pushX: number, pushY: number }}
     */
    compute(self, neighbors) {
        const acc = createSeparationAccum();

        for (let i = 0; i < neighbors.length; i++) {
            const other = neighbors[i];
            if (!this.shouldSeparate(self, other)) continue;

            accumulateSeparationFromPair(
                acc,
                self.x,
                self.y,
                self.radius,
                other.x,
                other.y,
                other.radius,
                this.neighborPad,
            );
        }

        return clampSeparationAccum(acc);
    }
}
