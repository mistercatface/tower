import { buildAgentDecisionContext, buildAgentDecisionFrame, pickAgentIntentPolicy } from "./buildAgentDecisionContext.js";
import { bandFromThresholds } from "./bandFromThresholds.js";
import { scoreDecisionCandidateDetails } from "./scoreDecisionModes.js";
import { deriveThreatState } from "./deriveThreatState.js";
import { scoreCandidateSet } from "../utility/utilityScoring.js";
import { getThreatConfig } from "../../Game/snake/snakeGameConfig.js";
import { deriveSnakeEngagementState } from "../../Game/snake/snakeEngagement.js";
import { AGENT_PROFILE, getAgentProfile } from "./agentProfile.js";
export { AGENT_PROFILE as AGENT_DECISION_PROFILE };
function buildScoringEnv(profile) {
    const env = { cohesion: profile.factionCohesion ?? {} };
    if (profile.scoringEnv?.effortFallback) env.effortFallback = profile.decisionPressure;
    if (profile.scoringEnv?.sprint) env.sprint = profile.sprint;
    return env;
}
const DECISION_EXTENSIONS = {
    [AGENT_PROFILE.snake]: {
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
    },
};
function createDecisionSpec(profileId) {
    const profile = () => getAgentProfile(profileId);
    return {
        decisionSchema: () => profile().decision,
        hungerBands: () => profile().hungerBands,
        threatConfig: () => getThreatConfig(),
        weights: () => profile().decisionWeights,
        pressure: () => profile().decisionPressure,
        scoringEnv: () => buildScoringEnv(profile()),
        sprintConfig: () => profile().sprint,
        ...(DECISION_EXTENSIONS[profileId] ?? {}),
    };
}
const DECISION_SPECS = Object.freeze({ [AGENT_PROFILE.snake]: createDecisionSpec(AGENT_PROFILE.snake), [AGENT_PROFILE.flee]: createDecisionSpec(AGENT_PROFILE.flee) });
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
