import { getAgentProfile, AGENT_PROFILE } from "../../AI/agents/agentProfile.js";
const PACK_STEERING_SCRATCH = { packAnchor: { x: 0, y: 0 }, packBlend: 0, maxPackDistCells: 16 };
export function resolvePackSteeringOptions(ctx, profileId = AGENT_PROFILE.flee) {
    const cohesion = getAgentProfile(profileId).factionCohesion ?? {};
    const packBlend = cohesion.fleePackBlend ?? 0;
    if (packBlend <= 0) return null;
    const known = ctx?.known;
    if (!known || (known.allyCount ?? 0) < 1) return null;
    const centroid = known.allyCentroid;
    if (centroid) {
        PACK_STEERING_SCRATCH.packAnchor.x = centroid.x;
        PACK_STEERING_SCRATCH.packAnchor.y = centroid.y;
    } else if (known.ally) {
        PACK_STEERING_SCRATCH.packAnchor.x = known.ally.x;
        PACK_STEERING_SCRATCH.packAnchor.y = known.ally.y;
    } else return null;
    PACK_STEERING_SCRATCH.packBlend = packBlend;
    PACK_STEERING_SCRATCH.maxPackDistCells = cohesion.maxPackDistCells ?? 16;
    return PACK_STEERING_SCRATCH;
}
