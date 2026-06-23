import { buildAgentDecisionContext } from "../../../AI/agents/buildAgentDecisionContext.js";
import { scoreDecisionCandidateDetails } from "../../../AI/agents/scoreDecisionModes.js";
import { getSnakeGameConfig } from "../snakeGameConfig.js";
export function deriveFleeSprintIntent(mode, threatState, hungerTier = null, foodFraction = null) {
    const fleeConfig = getSnakeGameConfig().fleeAgent;
    const pressure = fleeConfig.decisionPressure;
    const sprint = fleeConfig.sprint;
    const fraction = foodFraction ?? 1;
    const sprintFleeMin = sprint.sprintFleeMinHunger ?? pressure.sprintFleeMinHunger ?? 0.1;
    if (mode === "flee") {
        if (fraction < sprintFleeMin) return { want: false, reason: "starving" };
        if (threatState && (threatState.lethal || threatState.severity >= sprint.fleeSeverity)) return { want: true, reason: "escape" };
    }
    if (mode === "seek_food") {
        if (fraction < sprintFleeMin) return { want: false, reason: "starving" };
        if (threatState && !threatState.lethal && threatState.severity >= sprint.fleeSeverity && hungerTier === "desperate") return { want: true, reason: "race" };
    }
    if (mode === "seek_enemy") return { want: true, reason: "attack" };
    return { want: false, reason: "none" };
}
function fleeWeights() {
    return getSnakeGameConfig().fleeAgent.decisionWeights;
}
function fleePressure() {
    return getSnakeGameConfig().fleeAgent.decisionPressure;
}
function fleeScoringEnv() {
    const flee = getSnakeGameConfig().fleeAgent;
    return { sprint: flee.sprint, cohesion: flee.factionCohesion ?? {} };
}
export function scoreFleeIntentCandidateDetails(ctx, weights = fleeWeights(), pressure = fleePressure()) {
    return scoreDecisionCandidateDetails(ctx, getSnakeGameConfig().fleeAgent.decision, weights, pressure, fleeScoringEnv());
}
const fleeDecisionSpec = {
    decisionSchema: () => getSnakeGameConfig().fleeAgent.decision,
    hungerBands: () => getSnakeGameConfig().fleeAgent.hungerBands,
    threatConfig: () => getSnakeGameConfig(),
    weights: fleeWeights,
    pressure: fleePressure,
    scoringEnv: fleeScoringEnv,
    deriveSprint: (mode, threatState, hungerTier, ctx) => deriveFleeSprintIntent(mode, threatState, hungerTier, ctx.foodFraction),
};
export function buildFleeDecisionContext(input) {
    return buildAgentDecisionContext(fleeDecisionSpec, input);
}
