import { buildAgentDecisionContextInto, buildAgentDecisionFrameInto, createAgentDecisionContextFrame, pickAgentIntentPolicy } from "./buildAgentDecisionContext.js";
import { bandFromThresholds } from "./bandFromThresholds.js";
import { scoreDecisionCandidateDetails } from "./scoreDecisionModes.js";
import { scoreCandidateNetsInto, scoreCandidateSet } from "../utility/utilityScoring.js";
import { deriveRangedCombatState } from "../../Game/snake/rangedCombat.js";
import { AGENT_PROFILE, getAgentProfile } from "./agentProfile.js";
export { AGENT_PROFILE as AGENT_DECISION_PROFILE };
export { createAgentDecisionContextFrame } from "./buildAgentDecisionContext.js";
export function deriveSnakeEngagementState(ctx, chosenIntent) {
    const { known, remembered } = ctx;
    const salience = [];
    if (known.threat || remembered.threat) salience.push("threat");
    if (known.prey || remembered.prey) salience.push("prey");
    if (known.food || remembered.food) salience.push("food");
    const mode = chosenIntent?.mode ?? null;
    if (mode === "explore" || mode === "seek_ally" || salience.length === 0) return { active: false, salience, mode };
    const acting = (mode === "seek_food" && (known.food || remembered.food)) || (mode === "seek_prey" && (known.prey || remembered.prey)) || (mode === "flee" && (known.threat || remembered.threat));
    return { active: !!acting, salience, mode };
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
export function buildAgentDecisionSpec(profileId, profile = getAgentProfile(profileId)) {
    const spec = {
        profileId,
        decisionSchema: profile.decision,
        hungerBands: profile.hungerBands,
        weights: profile.decisionWeights,
        pressure: profile.decisionPressure,
        sprintConfig: profile.sprint,
        scoringCohesion: profile.factionCohesion ?? {},
        scoringEffortFallback: profile.scoringEnv?.effortFallback ? profile.decisionPressure : null,
        scoringSprint: profile.scoringEnv?.sprint ? profile.sprint : null,
        ...(DECISION_EXTENSIONS[profileId] ?? {}),
    };
    if (profile.weapon || profile.decision?.modes?.shoot_enemy) spec.deriveCombatState = (ctx, input) => deriveRangedCombatState(ctx, input, profile);
    return spec;
}
export function buildAgentDecisionFrameFor(profileId, input) {
    const spec = buildAgentDecisionSpec(profileId);
    const ctx = createAgentDecisionContextFrame(profileId);
    const foodFraction = input.foodFraction ?? null;
    const hungerTier = bandFromThresholds(foodFraction, spec.hungerBands);
    buildAgentDecisionFrameInto(ctx, spec, { ...input, foodFraction, hungerTier, profileId });
    return ctx;
}
export function buildAgentDecisionContextFor(profileId, input) {
    const spec = buildAgentDecisionSpec(profileId);
    const ctx = createAgentDecisionContextFrame(profileId);
    return buildAgentDecisionContextInto(ctx, spec, { ...input, profileId }, { includeScoreDetails: true });
}
export function buildAgentDecisionContextIntoFor(profileId, ctx, input, options) {
    return buildAgentDecisionContextInto(ctx, buildAgentDecisionSpec(profileId), { ...input, profileId }, options);
}
export function scoreAgentIntentCandidateDetails(profileId, ctx, weights = null, pressure = null) {
    const spec = buildAgentDecisionSpec(profileId);
    const env = { cohesion: spec.scoringCohesion };
    if (spec.scoringEffortFallback != null) env.effortFallback = spec.scoringEffortFallback;
    if (spec.scoringSprint != null) env.sprint = spec.scoringSprint;
    return scoreDecisionCandidateDetails(ctx, spec.decisionSchema, weights ?? spec.weights, pressure ?? spec.pressure, env);
}
export function scoreAgentIntentCandidates(profileId, ctx, weights = null, pressure = null) {
    const spec = buildAgentDecisionSpec(profileId);
    return scoreCandidateSet(scoreAgentIntentCandidateDetails(profileId, ctx, weights, pressure), spec.decisionSchema.scoreOrder).candidateScores;
}
export function pickAgentIntentPolicyFor(profileId, ctx, scores = null) {
    const spec = buildAgentDecisionSpec(profileId);
    const resolvedScores = scores ?? scoreAgentIntentCandidates(profileId, ctx);
    return pickAgentIntentPolicy(ctx, resolvedScores, spec);
}
