import { getSnakeGameConfig } from "../snakeGameConfig.js";
import { deriveSnakeThreatState } from "../snakeDecisionModel.js";
export function deriveFleeAgentThreatState(threat, threatDist) {
    return deriveSnakeThreatState(threat, threatDist);
}
export function deriveFleeSprintIntent(mode, threatState) {
    const fleeConfig = getSnakeGameConfig().fleeAgent;
    const fleeSeverity = fleeConfig.sprint.fleeSeverity;
    if (mode === "flee" && threatState && (threatState.lethal || threatState.severity >= fleeSeverity)) return { want: true, reason: "escape" };
    return { want: false, reason: "none" };
}
