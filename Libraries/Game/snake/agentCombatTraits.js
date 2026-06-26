import { getAgentProfile } from "../../AI/agents/agentProfile.js";
import { getSnakeGameConfig } from "./snakeGameConfig.js";
const COMBAT_TRAIT_DEFAULTS = Object.freeze({
    topology: "ball",
    canSplit: false,
    fleeBallHeadRam: false,
    fleeEscapeRam: false,
    victimOfFleeEscapeRam: false,
    victimOfHeadStrikeRam: false,
    brainRamResolver: null,
    preyHeadRamImmuneLeader: false,
    preyHeadRamImmuneNonLeader: false,
});
export function getAgentCombatTraits(profileId) {
    const profile = getAgentProfile(profileId, getSnakeGameConfig());
    return { ...COMBAT_TRAIT_DEFAULTS, ...profile.combat };
}
export function isChainCombatTopology(traits) {
    return traits.topology === "chain";
}
export function isBallCombatTopology(traits) {
    return traits.topology === "ball";
}
export function matchesBrainRamResolver(traits, resolverId) {
    return traits.brainRamResolver === resolverId;
}
export function shouldSkipPreyHeadRamKill(predatorTraits, preyTraits, preyBodyId, preyLeaderId) {
    const bothUseResolver = predatorTraits.brainRamResolver != null && predatorTraits.brainRamResolver === preyTraits.brainRamResolver;
    const leaderHit = preyBodyId === preyLeaderId;
    if (bothUseResolver) return true;
    if (isChainCombatTopology(preyTraits) && leaderHit && preyTraits.preyHeadRamImmuneLeader) return true;
    if (preyTraits.preyHeadRamImmuneNonLeader && !leaderHit) return true;
    return false;
}
