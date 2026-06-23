import { deriveAllyState } from "./deriveAllyState.js";
import { deriveThreatState } from "./deriveThreatState.js";
import { pushTargetEvents, routeEvents, intentPolicy, policyReasonForTarget } from "../agentIntent/targetEvents.js";
import { pickBestScoreKey, scoreCandidateSet } from "../utility/utilityScoring.js";
export function buildAgentDecisionFrame(spec, input) {
    const { visibleWorld, memoryWorld = null, memorySource = null, committedTarget = null, routeStatus = null, reachSteps = null, hungerState = null, threatState = null } = input;
    const visible = spec.buildVisible(visibleWorld, memorySource, memoryWorld, input);
    const remembered = spec.buildRemembered(memoryWorld, memorySource);
    const known = spec.buildKnown(visible, remembered, visibleWorld, input);
    const resolvedReachSteps = reachSteps ?? spec.defaultReachSteps();
    const events = routeEvents(routeStatus);
    for (const { kind, visibleTarget, rememberedTarget } of spec.eventTargets(visible, remembered, visibleWorld)) pushTargetEvents(events, kind, visibleTarget, rememberedTarget);
    for (const [mode, slotKey] of Object.entries(spec.targetLost)) if (!known[slotKey] && committedTarget?.mode === mode) events.push("TARGET_LOST");
    return {
        known,
        remembered,
        reachSteps: resolvedReachSteps,
        committedTarget,
        routeStatus,
        hungerState,
        threatState,
        allyState: deriveAllyState(visibleWorld, known, memorySource, spec.allySession?.(input) ?? null, resolvedReachSteps[spec.allyReachKey ?? "ally"]),
        events,
        ...(spec.extraFacts?.(input) ?? {}),
    };
}
export function pickAgentIntentPolicy(ctx, scores, spec) {
    const mode = pickBestScoreKey(scores, spec.scoreOrder).chosenKey;
    if (mode === "flee") return intentPolicy("flee", null, policyReasonForTarget(ctx, "threat"));
    if (mode === "explore") return { mode: "explore", targetId: null };
    const slotKey = spec.policySlot[mode];
    return intentPolicy(mode, ctx.known[slotKey].id, policyReasonForTarget(ctx, slotKey));
}
export function buildAgentDecisionContext(spec, input) {
    const hungerState = spec.deriveHunger(input.foodFraction);
    const threatState = deriveThreatState(input.visibleWorld.threat, input.reachSteps?.threat, input.cellSize ?? 16, spec.threatConfig());
    const ctx = buildAgentDecisionFrame(spec, { ...input, hungerState, threatState });
    const weights = spec.weights();
    const pressure = spec.pressure();
    const scoredCandidates = scoreCandidateSet(spec.scoreDetails(ctx, weights, pressure), spec.scoreOrder);
    const pickPolicy = input.pickPolicy ?? ((frame, scores) => pickAgentIntentPolicy(frame, scores, spec));
    const chosenIntent = pickPolicy(ctx, scoredCandidates.candidateScores);
    spec.afterPick?.(ctx, chosenIntent, input);
    const sprintIntent = spec.deriveSprint(chosenIntent.mode, threatState, hungerState, ctx);
    ctx.candidateScores = scoredCandidates.candidateScores;
    ctx.candidateScoreDetails = scoredCandidates.candidateScoreDetails;
    ctx.chosenIntent = chosenIntent;
    ctx.chosenReason = chosenIntent.reason ?? null;
    ctx.targetId = chosenIntent.targetId ?? null;
    ctx.sprintIntent = sprintIntent;
    return ctx;
}
