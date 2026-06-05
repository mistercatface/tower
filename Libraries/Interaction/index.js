/**
 * Libraries/Interaction — declarative pair filters (separation, projectile hits, …).
 */
export { pairRuleMatches, pairFilterAllows, compilePairFilter, mergePairFilter } from "./pairRules.js";
export { PairFilter } from "./PairFilter.js";
export { directFaction, standardResolvers } from "./resolvers.js";
export {
    COMBAT_SEPARATION,
    COMBAT_HOSTILE_PAIR,
    CHARGE_IMPACT,
    COMBATANT_PAIR,
    ACTOR_PUSHABLE_PAIR,
    PUSHABLE_PAIR,
    PUSHABLE_SLEEP_BLOCKER,
    PROJECTILE_HIT_ACTOR,
    PROJECTILE_HIT_PICKUP,
} from "./presets/combat.js";
