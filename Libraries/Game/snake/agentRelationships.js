import { getConnectedBodyIds } from "../../Motion/kineticConstraintGraph.js";
import { getAgentProfile } from "../../AI/agents/agentProfile.js";
import { getSnakeGameConfig } from "./snakeGameConfig.js";
import { getSnakeSegmentCount } from "./snakeScale.js";
function readFactions(state, seekerId, targetId) {
    const seekerHead = state.entityRegistry.getLive(seekerId);
    const targetHead = state.entityRegistry.getLive(targetId);
    return { seekerFaction: seekerHead?.faction ?? null, targetFaction: targetHead?.faction ?? null };
}
function readSegmentCount(state, headId, mode = "path") {
    if (mode === "component") return getConnectedBodyIds(state.kinetic, headId).length;
    return getSnakeSegmentCount(state, headId);
}
function resolveSizeBand(seekerSegs, targetSegs, maxGap) {
    if (Math.abs(seekerSegs - targetSegs) <= maxGap) return "rival";
    if (targetSegs > seekerSegs) return "threat";
    if (targetSegs < seekerSegs) return "prey";
    return "neutral";
}
function resolveFactionRelationship(seekerFaction, targetFaction, rule) {
    if (!seekerFaction || !targetFaction) return "neutral";
    if (seekerFaction === targetFaction) return rule.same ?? "ally";
    return rule.different ?? "prey";
}
function resolveSizeBandRelationship(state, seekerId, targetId, rule, profile, config) {
    const { seekerFaction, targetFaction } = readFactions(state, seekerId, targetId);
    if (rule.sameFaction != null) {
        if (!seekerFaction || !targetFaction) return "neutral";
        if (seekerFaction === targetFaction) return rule.sameFaction;
    }
    const maxGap = rule.maxSegmentGap ?? profile.rivalBand?.maxSegmentGap ?? config.rivalBand?.maxSegmentGap ?? 2;
    const seekerSegs = readSegmentCount(state, seekerId, rule.segmentCountAs ?? "path");
    const targetSegs = readSegmentCount(state, targetId, rule.targetSegmentCountAs ?? rule.segmentCountAs ?? "path");
    return resolveSizeBand(seekerSegs, targetSegs, maxGap);
}
/** Resolve seeker→target relationship from seeker profile config. */
export function resolveRelationshipFromProfile(seekerProfileId, targetSpeciesId, seekerId, targetId, state, config = getSnakeGameConfig()) {
    const profile = getAgentProfile(seekerProfileId, config);
    const rule = profile.relationships?.[targetSpeciesId];
    if (rule == null) return "neutral";
    if (typeof rule === "string") return rule;
    if (rule.type === "faction") {
        const { seekerFaction, targetFaction } = readFactions(state, seekerId, targetId);
        return resolveFactionRelationship(seekerFaction, targetFaction, rule);
    }
    if (rule.type === "sizeBand") return resolveSizeBandRelationship(state, seekerId, targetId, rule, profile, config);
    return "neutral";
}
