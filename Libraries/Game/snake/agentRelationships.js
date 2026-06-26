import { getAgentProfile } from "../../AI/agents/agentProfile.js";
import { getSnakeGameConfig } from "./snakeGameConfig.js";
let _bakedConfig = null;
const _bakedRulesByProfile = new Map();
function getBakedRules(profileId) {
    const config = getSnakeGameConfig();
    if (config !== _bakedConfig) {
        _bakedRulesByProfile.clear();
        _bakedConfig = config;
    }
    if (_bakedRulesByProfile.has(profileId)) return _bakedRulesByProfile.get(profileId);
    const profile = getAgentProfile(profileId, config);
    const baked = {};
    for (const [targetId, rule] of Object.entries(profile.relationships ?? {})) {
        if (typeof rule === "string") {
            baked[targetId] = rule;
            continue;
        }
        const r = { ...rule };
        if (rule.type === "sizeBand") r._maxGap = rule.maxSegmentGap ?? profile.rivalBand?.maxSegmentGap ?? config.rivalBand?.maxSegmentGap ?? 2;
        if (rule.type === "proximity") r._range = rule.range ?? profile.attackRange ?? config.shared?.lethalThreatRange ?? 48;
        baked[targetId] = r;
    }
    _bakedRulesByProfile.set(profileId, baked);
    return baked;
}
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
function resolveSizeBandRelationshipForInstances(seekerInstance, targetInstance, rule) {
    const seekerFaction = seekerInstance.head.faction ?? null;
    const targetFaction = targetInstance.head.faction ?? null;
    if (rule.sameFaction != null) {
        if (!seekerFaction || !targetFaction) return "neutral";
        if (seekerFaction === targetFaction) return rule.sameFaction;
    }
    return resolveSizeBand(readInstanceSegmentCount(seekerInstance), readInstanceSegmentCount(targetInstance), rule._maxGap);
}
function resolveProximityRelationship(rule, distSq) {
    if (distSq == null) return rule.far ?? "neutral";
    return distSq <= rule._range * rule._range ? rule.near : (rule.far ?? "neutral");
}
export function resolveRelationshipForInstances(seekerInstance, targetInstance, distSq = null) {
    const rules = getBakedRules(seekerInstance.profileId);
    const rule = rules[targetInstance.profileId];
    if (rule == null) return "neutral";
    if (typeof rule === "string") return rule;
    if (rule.type === "proximity") return resolveProximityRelationship(rule, distSq);
    if (rule.type === "faction") return resolveFactionRelationship(seekerInstance.head.faction ?? null, targetInstance.head.faction ?? null, rule);
    if (rule.type === "sizeBand") return resolveSizeBandRelationshipForInstances(seekerInstance, targetInstance, rule);
    return "neutral";
}
