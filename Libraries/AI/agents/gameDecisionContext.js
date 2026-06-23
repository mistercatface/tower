import { buildAgentDecisionContext, buildAgentDecisionFrame, pickAgentIntentPolicy } from "./buildAgentDecisionContext.js";
import { bandFromThresholds } from "./bandFromThresholds.js";
import { scoreDecisionCandidateDetails } from "./scoreDecisionModes.js";
import { deriveThreatState } from "./deriveThreatState.js";
import { scoreCandidateSet } from "../utility/utilityScoring.js";
import { getSnakeGameConfig } from "../../Game/snake/snakeGameConfig.js";
import { deriveSnakeEngagementState } from "../../Game/snake/snakeEngagement.js";
export const AGENT_DECISION_PROFILE = Object.freeze({ snake: "snake", flee: "flee_agent" });
function resolveProfileBundle(profileId) {
    const config = getSnakeGameConfig();
    if (profileId === AGENT_DECISION_PROFILE.snake) return config;
    if (profileId === AGENT_DECISION_PROFILE.flee) return config.fleeAgent;
    throw new Error(`unknown agent decision profile: ${profileId}`);
}
function buildScoringEnv(profileId) {
    const config = getSnakeGameConfig();
    if (profileId === AGENT_DECISION_PROFILE.snake) return { effortFallback: config.decisionPressure, cohesion: config.factionCohesion ?? {} };
    const flee = config.fleeAgent;
    return { sprint: flee.sprint, cohesion: flee.factionCohesion ?? {} };
}
function createDecisionSpec(profileId) {
    const bundle = () => resolveProfileBundle(profileId);
    const spec = {
        decisionSchema: () => bundle().decision,
        hungerBands: () => bundle().hungerBands,
        threatConfig: () => getSnakeGameConfig(),
        weights: () => bundle().decisionWeights,
        pressure: () => bundle().decisionPressure,
        scoringEnv: () => buildScoringEnv(profileId),
        sprintConfig: () => bundle().sprint,
    };
    if (profileId === AGENT_DECISION_PROFILE.snake) {
        spec.allySession = (input) => input.session ?? null;
        spec.extraFacts = (input) => ({
            safetyState: input.safetyState,
            recentFailures: input.recentFailures ?? [],
            seekerFaction: input.seekerFaction,
            seekerSegmentCount: input.seekerSegmentCount,
            engagementState: null,
        });
        spec.afterPick = (ctx, chosenIntent) => {
            ctx.engagementState = deriveSnakeEngagementState(ctx, chosenIntent);
        };
    }
    return spec;
}
const DECISION_SPECS = Object.freeze({
    [AGENT_DECISION_PROFILE.snake]: createDecisionSpec(AGENT_DECISION_PROFILE.snake),
    [AGENT_DECISION_PROFILE.flee]: createDecisionSpec(AGENT_DECISION_PROFILE.flee),
});
export function resolveAgentDecisionSpec(profileId) {
    const spec = DECISION_SPECS[profileId];
    if (!spec) throw new Error(`unknown agent decision profile: ${profileId}`);
    return spec;
}
export function buildAgentDecisionFrameFor(profileId, input) {
    const spec = resolveAgentDecisionSpec(profileId);
    const foodFraction = input.foodFraction ?? null;
    const hungerTier = bandFromThresholds(foodFraction, spec.hungerBands());
    const threatState = deriveThreatState(input.visibleWorld.threat, input.reachSteps?.threat, input.cellSize ?? 16, spec.threatConfig());
    return buildAgentDecisionFrame(spec, { ...input, foodFraction, hungerTier, threatState });
}
export function buildAgentDecisionContextFor(profileId, input) {
    return buildAgentDecisionContext(resolveAgentDecisionSpec(profileId), input);
}
export function scoreAgentIntentCandidateDetails(profileId, ctx, weights = null, pressure = null) {
    const spec = resolveAgentDecisionSpec(profileId);
    const resolvedWeights = weights ?? spec.weights();
    const resolvedPressure = pressure ?? spec.pressure();
    return scoreDecisionCandidateDetails(ctx, spec.decisionSchema(), resolvedWeights, resolvedPressure, spec.scoringEnv?.() ?? {});
}
export function scoreAgentIntentCandidates(profileId, ctx, weights = null, pressure = null) {
    const spec = resolveAgentDecisionSpec(profileId);
    return scoreCandidateSet(scoreAgentIntentCandidateDetails(profileId, ctx, weights, pressure), spec.decisionSchema().scoreOrder).candidateScores;
}
export function pickAgentIntentPolicyFor(profileId, ctx, scores = null) {
    const spec = resolveAgentDecisionSpec(profileId);
    const resolvedScores = scores ?? scoreAgentIntentCandidates(profileId, ctx);
    return pickAgentIntentPolicy(ctx, resolvedScores, spec);
}
