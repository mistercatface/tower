import { buildAgentDecisionContextInto, buildAgentDecisionFrameInto, createAgentDecisionContextFrame, pickAgentIntentPolicy } from "./buildAgentDecisionContext.js";
import { bandFromThresholds } from "./bandFromThresholds.js";
import { scoreDecisionCandidateDetails } from "./scoreDecisionModes.js";
import { scoreCandidateNetsInto, scoreCandidateSet } from "../utility/utilityScoring.js";
import { deriveSnakeEngagementState } from "../../Game/snake/snakeEngagement.js";
import { deriveGunCombatState } from "../../Game/snake/gunAgent/deriveGunCombatState.js";
import { AGENT_PROFILE, getAgentProfile } from "./agentProfile.js";
export { AGENT_PROFILE as AGENT_DECISION_PROFILE };
export { createAgentDecisionContextFrame } from "./buildAgentDecisionContext.js";
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
    [AGENT_PROFILE.gun]: { deriveCombatState: (ctx, input) => deriveGunCombatState(ctx, input) },
};
function createDecisionSpec(profileId) {
    const profile = () => getAgentProfile(profileId);
    return {
        profileId,
        decisionSchema: () => profile().decision,
        hungerBands: () => profile().hungerBands,
        weights: () => profile().decisionWeights,
        pressure: () => profile().decisionPressure,
        sprintConfig: () => profile().sprint,
        ...(DECISION_EXTENSIONS[profileId] ?? {}),
    };
}
const DECISION_SPECS = Object.freeze({
    [AGENT_PROFILE.snake]: createDecisionSpec(AGENT_PROFILE.snake),
    [AGENT_PROFILE.flee]: createDecisionSpec(AGENT_PROFILE.flee),
    [AGENT_PROFILE.squid]: createDecisionSpec(AGENT_PROFILE.squid),
    [AGENT_PROFILE.gun]: createDecisionSpec(AGENT_PROFILE.gun),
});
export function resolveAgentDecisionSpec(profileId) {
    const spec = DECISION_SPECS[profileId];
    if (!spec) throw new Error(`unknown agent decision profile: ${profileId}`);
    return spec;
}
export function buildAgentDecisionFrameFor(profileId, input) {
    const spec = resolveAgentDecisionSpec(profileId);
    const ctx = createAgentDecisionContextFrame(profileId);
    const foodFraction = input.foodFraction ?? null;
    const hungerTier = bandFromThresholds(foodFraction, spec.hungerBands());
    buildAgentDecisionFrameInto(ctx, spec, { ...input, foodFraction, hungerTier, profileId });
    return ctx;
}
export function buildAgentDecisionContextFor(profileId, input) {
    const spec = resolveAgentDecisionSpec(profileId);
    const ctx = createAgentDecisionContextFrame(profileId);
    return buildAgentDecisionContextInto(ctx, spec, { ...input, profileId }, { includeScoreDetails: true });
}
export function buildAgentDecisionContextIntoFor(profileId, ctx, input, options) {
    return buildAgentDecisionContextInto(ctx, resolveAgentDecisionSpec(profileId), { ...input, profileId }, options);
}
export function scoreAgentIntentCandidateDetails(profileId, ctx, weights = null, pressure = null) {
    const spec = resolveAgentDecisionSpec(profileId);
    const profile = getAgentProfile(profileId);
    const env = { cohesion: profile.factionCohesion ?? {} };
    if (profile.scoringEnv?.effortFallback) env.effortFallback = profile.decisionPressure;
    if (profile.scoringEnv?.sprint) env.sprint = profile.sprint;
    return scoreDecisionCandidateDetails(ctx, spec.decisionSchema(), weights ?? spec.weights(), pressure ?? spec.pressure(), env);
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
