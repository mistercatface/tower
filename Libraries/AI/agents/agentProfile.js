import { getSnakeGameConfig } from "../../Game/snake/snakeGameConfig.js";
export const AGENT_PROFILE = Object.freeze({ snake: "snake", flee: "flee_agent" });
export function getAgentProfile(profileId, config = getSnakeGameConfig()) {
    const profile = config.agentProfiles?.[profileId];
    if (!profile) throw new Error(`unknown agent profile: ${profileId}`);
    return profile;
}
