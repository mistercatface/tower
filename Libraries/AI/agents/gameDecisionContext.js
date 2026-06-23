import { buildAgentDecisionContext, buildAgentDecisionFrame, pickAgentIntentPolicy } from "./buildAgentDecisionContext.js";
import { bandFromThresholds } from "./bandFromThresholds.js";
import { scoreDecisionCandidateDetails } from "./scoreDecisionModes.js";
import { deriveThreatState } from "./deriveThreatState.js";
import { scoreCandidateSet } from "../utility/utilityScoring.js";
import { getSnakeGameConfig } from "../../Game/snake/snakeGameConfig.js";
import { deriveSnakeEngagementState } from "../../Game/snake/snakeEngagement.js";
function snakeScoringEnv() {
    return { effortFallback: getSnakeGameConfig().decisionPressure, cohesion: getSnakeGameConfig().factionCohesion ?? {} };
}
function fleeScoringEnv() {
    const flee = getSnakeGameConfig().fleeAgent;
    return { sprint: flee.sprint, cohesion: flee.factionCohesion ?? {} };
}
const snakeDecisionSpec = {
    decisionSchema: () => getSnakeGameConfig().decision,
    hungerBands: () => getSnakeGameConfig().hungerBands,
    threatConfig: () => getSnakeGameConfig(),
    weights: () => getSnakeGameConfig().decisionWeights,
    pressure: () => getSnakeGameConfig().decisionPressure,
    scoringEnv: snakeScoringEnv,
    sprintConfig: () => getSnakeGameConfig().sprint,
    allySession: (input) => input.session ?? null,
    extraFacts: (input) => ({
        safetyState: input.safetyState,
        recentFailures: input.recentFailures ?? [],
        seekerFaction: input.seekerFaction,
        seekerSegmentCount: input.seekerSegmentCount,
        engagementState: null,
    }),
    afterPick: (ctx, chosenIntent) => {
        ctx.engagementState = deriveSnakeEngagementState(ctx, chosenIntent);
    },
};
const fleeDecisionSpec = {
    decisionSchema: () => getSnakeGameConfig().fleeAgent.decision,
    hungerBands: () => getSnakeGameConfig().fleeAgent.hungerBands,
    threatConfig: () => getSnakeGameConfig(),
    weights: () => getSnakeGameConfig().fleeAgent.decisionWeights,
    pressure: () => getSnakeGameConfig().fleeAgent.decisionPressure,
    scoringEnv: fleeScoringEnv,
    sprintConfig: () => getSnakeGameConfig().fleeAgent.sprint,
};
export function scoreSnakeIntentCandidateDetails(ctx, weights = getSnakeGameConfig().decisionWeights, pressure = getSnakeGameConfig().decisionPressure) {
    return scoreDecisionCandidateDetails(ctx, getSnakeGameConfig().decision, weights, pressure, snakeScoringEnv());
}
export function scoreFleeIntentCandidateDetails(ctx, weights = getSnakeGameConfig().fleeAgent.decisionWeights, pressure = getSnakeGameConfig().fleeAgent.decisionPressure) {
    return scoreDecisionCandidateDetails(ctx, getSnakeGameConfig().fleeAgent.decision, weights, pressure, fleeScoringEnv());
}
export function scoreSnakeIntentCandidates(ctx, weights, pressure) {
    return scoreCandidateSet(scoreSnakeIntentCandidateDetails(ctx, weights, pressure), getSnakeGameConfig().decision.scoreOrder).candidateScores;
}
export function buildSnakeDecisionFrame(input) {
    const foodFraction = input.foodFraction ?? null;
    const hungerTier = bandFromThresholds(foodFraction, snakeDecisionSpec.hungerBands());
    const threatState = deriveThreatState(input.visibleWorld.threat, input.reachSteps?.threat, input.cellSize ?? 16, getSnakeGameConfig());
    return buildAgentDecisionFrame(snakeDecisionSpec, { ...input, foodFraction, hungerTier, threatState });
}
export function buildSnakeDecisionContext(input) {
    return buildAgentDecisionContext(snakeDecisionSpec, input);
}
export function buildFleeDecisionContext(input) {
    return buildAgentDecisionContext(fleeDecisionSpec, input);
}
export function pickSnakeIntentPolicy(ctx, scores = scoreSnakeIntentCandidates(ctx)) {
    return pickAgentIntentPolicy(ctx, scores, snakeDecisionSpec);
}
