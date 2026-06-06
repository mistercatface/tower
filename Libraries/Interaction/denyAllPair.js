/** @typedef {import("./pairRules.js").PairFilterConfig} PairFilterConfig */

/** Pair filter that never matches — used for unused interaction slots. */
export const DENY_ALL_PAIR = /** @type {PairFilterConfig} */ ({
    inclusions: [{ target: "pair", bothSet: "_denyAllInteractionPairs", equal: true }],
});
