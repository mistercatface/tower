import { buildAgentDecisionContext, buildAgentDecisionFrame, pickAgentIntentPolicy } from "./buildAgentDecisionContext.js";
import { bandFromThresholds } from "./bandFromThresholds.js";
import { scoreDecisionCandidateDetails } from "./scoreDecisionModes.js";
import { deriveThreatState } from "./deriveThreatState.js";
import { scoreCandidateSet } from "../utility/utilityScoring.js";
import { getSnakeGameConfig } from "../../Game/snake/snakeGameConfig.js";
import { deriveSnakeEngagementState } from "../../Game/snake/snakeEngagement.js";
export function deriveSnakeSprintIntent(mode, threatState) {
    const sprint = getSnakeGameConfig().sprint;
    if (mode === "flee" && threatState && (threatState.lethal || threatState.severity >= sprint.fleeSeverity)) return { want: true, reason: "escape" };
    if (mode === "seek_food" && threatState && !threatState.lethal && threatState.severity >= sprint.fleeSeverity) return { want: true, reason: "feed" };
    if (mode === "seek_prey") return { want: true, reason: "chase" };
    return { want: false, reason: "none" };
}
export function deriveFleeSprintIntent(mode, threatState, hungerTier = null, foodFraction = null) {
    const flee = getSnakeGameConfig().fleeAgent;
    const sprint = flee.sprint;
    const fraction = foodFraction ?? 1;
    const sprintFleeMin = sprint.sprintFleeMinHunger ?? flee.decisionPressure.sprintFleeMinHunger ?? 0.1;
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
    allySession: (input) => input.session ?? null,
    extraFacts: (input) => ({
        safetyState: input.safetyState,
        recentFailures: input.recentFailures ?? [],
        seekerFaction: input.seekerFaction,
        seekerSegmentCount: input.seekerSegmentCount,
        engagementState: null,
    }),
    deriveSprint: (mode, threatState) => deriveSnakeSprintIntent(mode, threatState),
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
    deriveSprint: (mode, threatState, hungerTier, ctx) => deriveFleeSprintIntent(mode, threatState, hungerTier, ctx.foodFraction),
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
