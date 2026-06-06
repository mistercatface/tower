import { inferFaction } from "../targeting.js";
import { hostileFactionPairs } from "../../../Config/content/factions.js";
/** @typedef {import("../../../Libraries/Interaction/pairRules.js").PairFilterConfig} PairFilterConfig */
export const combatResolvers = { faction: inferFaction };
/** @type {PairFilterConfig} */
export const withCombatResolvers = { resolvers: combatResolvers };
/** @type {PairFilterConfig} */
export const excludeUndefinedFactionOther = { exclusions: [{ target: "other", resolve: "faction", isUndefined: true }] };
/** @type {PairFilterConfig} */
export const excludeChargeVsPlayer = {
    exclusions: [
        { target: "pair", other: { resolve: "faction", equals: "player" }, self: { prop: "attackType", equals: "charge" } },
        { target: "pair", self: { resolve: "faction", equals: "player" }, other: { prop: "attackType", equals: "charge" } },
    ],
};
/** @type {PairFilterConfig} */
export const includeCrossFactionHostile = { inclusions: hostileFactionPairs.map((pair) => ({ target: "pair", crossFaction: pair })) };
