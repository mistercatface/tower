/**
 * Libraries/Interaction — declarative pair filters (separation, projectile hits, …).
 */
export { pairRuleMatches, pairFilterAllows } from "./pairRules.js";
export { PairFilter } from "./PairFilter.js";
export { directFaction, standardResolvers } from "./resolvers.js";
export {
    COMBAT_SEPARATION,
    PROJECTILE_HIT_ACTOR,
    PROJECTILE_HIT_PICKUP,
} from "./presets/combat.js";
