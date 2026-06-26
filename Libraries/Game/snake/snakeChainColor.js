import { getPropVisualTint, setPropVisualTint } from "../../Color/visualOverride.js";
export function resolveAgentTeamForIndex(profile, index) {
    const teams = profile.teams;
    if (!Array.isArray(teams) || teams.length === 0) return { faction: profile.faction ?? "neutral", color: null };
    return teams[index % teams.length] ?? teams[0];
}
export function resolveAgentTeamForFaction(profile, faction) {
    const teams = profile.teams;
    if (Array.isArray(teams)) for (let i = 0; i < teams.length; i++) if (teams[i].faction === faction) return teams[i];
    return { faction, color: null };
}
export function applySnakeChainTint(members, tintHex) {
    if (tintHex == null) return;
    for (let i = 0; i < members.length; i++) setPropVisualTint(members[i], tintHex);
}
export function copySnakeChainTintFromHead(head, prop) {
    const tint = getPropVisualTint(head);
    if (tint != null) setPropVisualTint(prop, tint);
}
