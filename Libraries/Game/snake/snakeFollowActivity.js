import { getSnakeGameConfig } from "./snakeGameConfig.js";
export function resolveSnakeAgentMode(session, headId) {
    return session?.autosimsByHeadId?.get(headId)?.getMode?.() ?? null;
}
export function isSnakeFollowableTarget(session, headId, config = getSnakeGameConfig()) {
    if (!session || headId == null) return false;
    const autosim = session.autosimsByHeadId.get(headId);
    if (!autosim) return false;
    const cohesion = config.factionCohesion ?? {};
    const activeModes = cohesion.followActiveModes ?? ["seek_prey", "seek_food"];
    const mode = autosim.getMode?.();
    if (!mode || !activeModes.includes(mode)) return false;
    if (cohesion.requireFollowTarget !== false && autosim.getTargetId?.() == null) return false;
    return true;
}
