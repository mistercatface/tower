import { getAgentProfile, AGENT_PROFILE } from "../../AI/agents/agentProfile.js";
export function resolvePackSteeringOptions(ctx, profileId = AGENT_PROFILE.flee) {
    const cohesion = getAgentProfile(profileId).factionCohesion ?? {};
    const packBlend = cohesion.fleePackBlend ?? 0;
    if (packBlend <= 0) return null;
    const known = ctx?.known;
    if (!known || (known.allyCount ?? 0) < 1) return null;
    const packAnchor = known.allyCentroid ?? (known.ally ? { x: known.ally.x, y: known.ally.y } : null);
    if (!packAnchor) return null;
    return { packAnchor, packBlend, maxPackDistCells: cohesion.maxPackDistCells ?? 16 };
}
