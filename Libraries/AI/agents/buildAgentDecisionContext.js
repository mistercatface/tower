import { buildAgentEventTargets } from "./buildAgentEventTargets.js";
import { deriveAllyState } from "./deriveAllyState.js";
import { deriveThreatState } from "./deriveThreatState.js";
import { mergeSlotsFromSchema } from "./mergeSlotsFromSchema.js";
import { scoreDecisionCandidateDetails } from "./scoreDecisionModes.js";
import { pushTargetEvents, routeEvents, intentPolicy, policyReasonForTarget } from "../agentIntent/targetEvents.js";
import { pickBestScoreKey, scoreCandidateSet } from "../utility/utilityScoring.js";
const EMPTY_AGENT_REACH_STEPS = Object.freeze({ threat: null, prey: null, enemy: null, food: null, ally: null });
export function buildAgentDecisionFrame(spec, input) {
    const schema = spec.decisionSchema();
    const { visibleWorld, memoryWorld = null, memorySource = null, committedTarget = null, routeStatus = null, reachSteps = null, foodFraction = null, hungerTier = null, threatState = null } = input;
    const { visible, remembered, known } = mergeSlotsFromSchema(schema, visibleWorld, memoryWorld, memorySource, input);
    const resolvedReachSteps = reachSteps ?? EMPTY_AGENT_REACH_STEPS;
    const events = routeEvents(routeStatus);
    for (const { kind, visibleTarget, rememberedTarget } of buildAgentEventTargets(visible, remembered, visibleWorld, schema.eventTargets))
        pushTargetEvents(events, kind, visibleTarget, rememberedTarget);
    for (const [mode, slotKey] of Object.entries(schema.targetLost)) if (!known[slotKey] && committedTarget?.mode === mode) events.push("TARGET_LOST");
    return {
        known,
        remembered,
        reachSteps: resolvedReachSteps,
        committedTarget,
        routeStatus,
        foodFraction,
        hungerTier,
        threatState,
        allyState: deriveAllyState(visibleWorld, known, memorySource, spec.allySession?.(input) ?? null, resolvedReachSteps[spec.allyReachKey ?? "ally"]),
        events,
        ...(spec.extraFacts?.(input) ?? {}),
    };
}
export function pickAgentIntentPolicy(ctx, scores, spec) {
    const schema = spec.decisionSchema();
    const mode = pickBestScoreKey(scores, schema.scoreOrder).chosenKey;
    if (mode === "flee") return intentPolicy("flee", null, policyReasonForTarget(ctx, "threat"));
    if (mode === "explore") return { mode: "explore", targetId: null };
    const slotKey = schema.targetLost[mode];
    return intentPolicy(mode, ctx.known[slotKey].id, policyReasonForTarget(ctx, slotKey));
}
export function buildAgentDecisionContext(spec, input) {
    const schema = spec.decisionSchema();
    const foodFraction = input.foodFraction ?? null;
    const hungerTier = foodFraction == null ? null : foodFraction >= spec.hungerSatisfiedAt() ? "satisfied" : foodFraction < spec.hungerDesperateBelow() ? "desperate" : "hungry";
    const threatState = deriveThreatState(input.visibleWorld.threat, input.reachSteps?.threat, input.cellSize ?? 16, spec.threatConfig());
    const ctx = buildAgentDecisionFrame(spec, { ...input, foodFraction, hungerTier, threatState });
    const weights = spec.weights();
    const pressure = spec.pressure();
    const env = spec.scoringEnv?.() ?? {};
    const scoredCandidates = scoreCandidateSet(scoreDecisionCandidateDetails(ctx, schema, weights, pressure, env), schema.scoreOrder);
    const pickPolicy = input.pickPolicy ?? ((frame, scores) => pickAgentIntentPolicy(frame, scores, spec));
    const chosenIntent = pickPolicy(ctx, scoredCandidates.candidateScores);
    spec.afterPick?.(ctx, chosenIntent, input);
    const sprintIntent = spec.deriveSprint(chosenIntent.mode, threatState, hungerTier, ctx);
    ctx.candidateScores = scoredCandidates.candidateScores;
    ctx.candidateScoreDetails = scoredCandidates.candidateScoreDetails;
    ctx.chosenIntent = chosenIntent;
    ctx.chosenReason = chosenIntent.reason ?? null;
    ctx.targetId = chosenIntent.targetId ?? null;
    ctx.sprintIntent = sprintIntent;
    return ctx;
}
