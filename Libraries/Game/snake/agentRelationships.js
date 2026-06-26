import { getAgentProfile } from "../../AI/agents/agentProfile.js";
import { getSnakeGameConfig } from "./snakeGameConfig.js";
function readInstanceSegmentCount(instance) {
    return instance.memberIds.length;
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
function resolveSizeBandRelationshipForInstances(seekerInstance, targetInstance, rule, profile, config) {
    const seekerFaction = seekerInstance.head.faction ?? null;
    const targetFaction = targetInstance.head.faction ?? null;
    if (rule.sameFaction != null) {
        if (!seekerFaction || !targetFaction) return "neutral";
        if (seekerFaction === targetFaction) return rule.sameFaction;
    }
    const maxGap = rule.maxSegmentGap ?? profile.rivalBand?.maxSegmentGap ?? config.rivalBand?.maxSegmentGap ?? 2;
    return resolveSizeBand(readInstanceSegmentCount(seekerInstance), readInstanceSegmentCount(targetInstance), maxGap);
}
function resolveProximityRelationship(rule, profile, config, distSq) {
    const range = rule.range ?? profile.attackRange ?? config.shared?.lethalThreatRange ?? 48;
    if (distSq == null) return rule.far ?? "neutral";
    return distSq <= range * range ? rule.near : (rule.far ?? "neutral");
}
export function resolveRelationshipForInstances(seekerInstance, targetInstance, distSq = null) {
    const config = getSnakeGameConfig();
    const profile = getAgentProfile(seekerInstance.profileId, config);
    const rule = profile.relationships?.[targetInstance.profileId];
    if (rule == null) return "neutral";
    if (typeof rule === "string") return rule;
    if (rule.type === "proximity") return resolveProximityRelationship(rule, profile, config, distSq);
    if (rule.type === "faction") return resolveFactionRelationship(seekerInstance.head.faction ?? null, targetInstance.head.faction ?? null, rule);
    if (rule.type === "sizeBand") return resolveSizeBandRelationshipForInstances(seekerInstance, targetInstance, rule, profile, config);
    return "neutral";
}
