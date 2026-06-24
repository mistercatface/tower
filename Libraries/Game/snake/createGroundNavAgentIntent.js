import { buildGroundNavIntentAdapterOptions } from "./groundNavIntentProfiles.js";
import { createGroundNavIntentAdapter } from "./createGroundNavIntentAdapter.js";
import { getSharedConfig } from "./snakeGameConfig.js";
export function createGroundNavAgentIntent({
    profileId,
    brain,
    sync,
    headNav,
    resolveVisibleFood,
    resolveExploreCell,
    agentCtx,
    visionRange = null,
    seekArrivalRadius = null,
    resolveHunger = null,
    resolveSegmentCount = null,
    rng = Math.random,
}) {
    const deps = { brain, sync, headNav, resolveVisibleFood, resolveExploreCell, agentCtx, navWalkable: agentCtx.navWalkable, visionRange, seekArrivalRadius, resolveHunger, resolveSegmentCount, rng };
    return createGroundNavIntentAdapter({ ...deps, config: getSharedConfig(), ...buildGroundNavIntentAdapterOptions(profileId, deps) });
}
