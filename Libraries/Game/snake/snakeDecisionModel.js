import { buildAgentDecisionContext, buildAgentDecisionFrame, pickAgentIntentPolicy } from "../../AI/agents/buildAgentDecisionContext.js";
import { bandFromThresholds } from "../../AI/agents/bandFromThresholds.js";
import { scoreDecisionCandidateDetails } from "../../AI/agents/scoreDecisionModes.js";
import { deriveThreatState } from "../../AI/agents/deriveThreatState.js";
import { scoreCandidateSet } from "../../AI/utility/utilityScoring.js";
import { getSnakeGameConfig } from "./snakeGameConfig.js";
import { deriveSnakeEngagementState } from "./snakeEngagement.js";
export function deriveSprintIntent(mode, threatState) {
    if (mode === "flee" && threatState && (threatState.lethal || threatState.severity >= getSnakeGameConfig().sprint.fleeSeverity)) return { want: true, reason: "escape" };
    if (mode === "seek_food" && threatState && !threatState.lethal && threatState.severity >= getSnakeGameConfig().sprint.fleeSeverity) return { want: true, reason: "feed" };
    if (mode === "seek_prey") return { want: true, reason: "chase" };
    return { want: false, reason: "none" };
}
function snakeScoringEnv() {
    return { effortFallback: getSnakeGameConfig().decisionPressure, cohesion: getSnakeGameConfig().factionCohesion ?? {} };
}
export function scoreSnakeIntentCandidateDetails(ctx, weights = getSnakeGameConfig().decisionWeights, pressure = getSnakeGameConfig().decisionPressure) {
    return scoreDecisionCandidateDetails(ctx, getSnakeGameConfig().decision, weights, pressure, snakeScoringEnv());
}
export function scoreSnakeIntentCandidates(ctx, weights, pressure) {
    return scoreCandidateSet(scoreSnakeIntentCandidateDetails(ctx, weights, pressure), getSnakeGameConfig().decision.scoreOrder).candidateScores;
}
const snakeDecisionSpec = {
    decisionSchema: () => getSnakeGameConfig().decision,
    hungerBands: () => getSnakeGameConfig().hungerBands,
    threatConfig: () => getSnakeGameConfig(),
    weights: () => getSnakeGameConfig().decisionWeights,
    pressure: () => getSnakeGameConfig().decisionPressure,
    scoringEnv: snakeScoringEnv,
    allySession: (input) => input.session ?? null,
    extraFacts: (input) => ({
        safetyState: input.safetyState,
        recentFailures: input.recentFailures ?? [],
        seekerFaction: input.seekerFaction,
        seekerSegmentCount: input.seekerSegmentCount,
        engagementState: null,
    }),
    deriveSprint: (mode, threatState) => deriveSprintIntent(mode, threatState),
    afterPick: (ctx, chosenIntent) => {
        ctx.engagementState = deriveSnakeEngagementState(ctx, chosenIntent);
    },
};
export function buildSnakeDecisionFrame(input) {
    const foodFraction = input.foodFraction ?? null;
    const hungerTier = bandFromThresholds(foodFraction, snakeDecisionSpec.hungerBands());
    const threatState = deriveThreatState(input.visibleWorld.threat, input.reachSteps?.threat, input.cellSize ?? 16, getSnakeGameConfig());
    return buildAgentDecisionFrame(snakeDecisionSpec, { ...input, foodFraction, hungerTier, threatState });
}
export function pickSnakeIntentPolicy(ctx, scores = scoreSnakeIntentCandidates(ctx)) {
    return pickAgentIntentPolicy(ctx, scores, snakeDecisionSpec);
}
export function buildSnakeDecisionContext(input) {
    return buildAgentDecisionContext(snakeDecisionSpec, input);
}
