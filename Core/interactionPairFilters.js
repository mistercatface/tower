import { PairFilter } from "../Libraries/Interaction/PairFilter.js";
import { createDefaultInteractionPairs } from "../Libraries/Interaction/defaultPhysicsPairs.js";
import { sandboxInteractionPairs } from "../Libraries/Combat/sandboxInteraction.js";
/** @typedef {import("./GameDefinitionTypes.js").InteractionPairsPort} InteractionPairsPort */
/** @returns {InteractionPairsPort} */
export function getInteractionPairs() {
    const overrides = sandboxInteractionPairs;
    return { ...createDefaultInteractionPairs(), ...overrides };
}
/** @type {Map<keyof InteractionPairsPort, PairFilter>} */
const pairFilterCache = new Map();
export function clearInteractionPairFilterCache() {
    pairFilterCache.clear();
}
/** @param {keyof InteractionPairsPort} name */
export function getInteractionPairFilter(name) {
    let filter = pairFilterCache.get(name);
    if (!filter) {
        filter = new PairFilter(getInteractionPairs()[name]);
        pairFilterCache.set(name, filter);
    }
    return filter;
}
