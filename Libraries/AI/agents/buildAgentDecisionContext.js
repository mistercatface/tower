import { deriveAllyState } from "./deriveAllyState.js";
import { deriveThreatState } from "./deriveThreatState.js";
import { pushTargetEvents, routeEvents, intentPolicy, policyReasonForTarget } from "../agentIntent/targetEvents.js";
import { pickBestScoreKey, scoreCandidateSet } from "../utility/utilityScoring.js";
export function createAgentDecisionBlackboard(spec, input) {
    const { visibleWorld, memoryWorld = null, memorySource = null, committedTarget = null, routeStatus = null, reachSteps = null, hungerState = null, threatState = null } = input;
    const visible = spec.buildVisible(visibleWorld, memorySource, memoryWorld, input);
    const remembered = spec.buildRemembered(memoryWorld, memorySource);
    const known = spec.buildKnown(visible, remembered, visibleWorld, input);
    const resolvedReachSteps = reachSteps ?? spec.defaultReachSteps();
    const events = routeEvents(routeStatus);
    for (const { kind, visibleTarget, rememberedTarget } of spec.eventTargets(visible, remembered, visibleWorld)) pushTargetEvents(events, kind, visibleTarget, rememberedTarget);
    for (const [mode, slotKey] of Object.entries(spec.targetLost)) if (!known[slotKey] && committedTarget?.mode === mode) events.push("TARGET_LOST");
    return {
        facts: {
            visible,
            remembered,
            known,
            reachSteps: resolvedReachSteps,
            committedTarget,
            routeStatus,
            hungerState,
            threatState,
            allyState: deriveAllyState(visibleWorld, known, memorySource, spec.allySession?.(input) ?? null, resolvedReachSteps[spec.allyReachKey ?? "ally"]),
            ...(spec.extraFacts?.(input) ?? {}),
        },
        events,
    };
}
export function pickAgentIntentPolicy(blackboard, scores, spec) {
    const mode = pickBestScoreKey(scores, spec.scoreOrder).chosenKey;
    if (mode === "flee") return intentPolicy("flee", null, policyReasonForTarget(blackboard, "threat"));
    if (mode === "explore") return { mode: "explore", targetId: null };
    const slotKey = spec.policySlot[mode];
    return intentPolicy(mode, blackboard.facts.known[slotKey].id, policyReasonForTarget(blackboard, slotKey));
}
export function buildAgentDecisionContext(spec, input) {
    const hungerState = spec.deriveHunger(input.foodFraction);
    const threatState = deriveThreatState(input.visibleWorld.threat, input.reachSteps?.threat, input.cellSize ?? 16, spec.threatConfig());
    const blackboard = createAgentDecisionBlackboard(spec, { ...input, hungerState, threatState });
    const weights = spec.weights();
    const pressure = spec.pressure();
    const scoredCandidates = scoreCandidateSet(spec.scoreDetails(blackboard, weights, pressure), spec.scoreOrder);
    const pickPolicy = input.pickPolicy ?? ((bb, scores) => pickAgentIntentPolicy(bb, scores, spec));
    const chosenIntent = pickPolicy(blackboard, scoredCandidates.candidateScores);
    spec.afterPick?.(blackboard, chosenIntent, input);
    const sprintIntent = spec.deriveSprint(chosenIntent.mode, threatState, hungerState, blackboard);
    return {
        blackboard,
        decisionSnapshot: {
            ...(spec.snapshotExtra?.(blackboard) ?? {}),
            events: blackboard.events,
            hungerState,
            threatState,
            allyState: blackboard.facts.allyState,
            routeStatus: input.routeStatus,
            committedTarget: input.committedTarget,
            candidateScores: scoredCandidates.candidateScores,
            candidateScoreDetails: scoredCandidates.candidateScoreDetails,
            chosenIntent,
            chosenReason: chosenIntent.reason ?? null,
            targetId: chosenIntent.targetId ?? null,
            sprintIntent,
        },
    };
}
