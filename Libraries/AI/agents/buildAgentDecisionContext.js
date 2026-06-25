import { bandFromThresholds } from "./bandFromThresholds.js";
import { deriveAllyStateInto } from "./deriveAllyState.js";
import { deriveThreatStateInto } from "./deriveThreatState.js";
import { mergeSlotsFromSchemaInto } from "./mergeSlotsFromSchema.js";
import { scoreDecisionCandidateDetails } from "./scoreDecisionModes.js";
import { deriveSprintIntent } from "./deriveSprintIntent.js";
import { pushTargetEvents, routeEventsInto, intentPolicy, policyReasonForTarget } from "../agentIntent/targetEvents.js";
import { pickBestScoreKey, scoreCandidateNetsInto, scoreCandidateSet } from "../utility/utilityScoring.js";
import { getAgentProfile } from "./agentProfile.js";
import { getSharedConfig } from "../../Game/snake/snakeGameConfig.js";
const EMPTY_AGENT_REACH_STEPS = Object.freeze({ threat: null, prey: null, enemy: null, food: null, ally: null });
function pushSchemaEventTargets(events, visible, remembered, visibleWorld, eventTargets) {
    for (let i = 0; i < eventTargets.length; i++) {
        const slot = eventTargets[i];
        if (typeof slot === "string") {
            pushTargetEvents(events, slot, visible[slot] ?? visibleWorld[slot] ?? null, remembered[slot] ?? null);
            continue;
        }
        const { kind, visible: pickVisible, remembered: pickRemembered } = slot;
        pushTargetEvents(
            events,
            kind,
            pickVisible ? pickVisible(visible, remembered, visibleWorld) : visibleWorld[kind],
            pickRemembered ? pickRemembered(visible, remembered, visibleWorld) : remembered[kind],
        );
    }
}
function writeScoringEnvInto(env, profile) {
    env.cohesion = profile.factionCohesion ?? {};
    if (profile.scoringEnv?.effortFallback) env.effortFallback = profile.decisionPressure;
    else delete env.effortFallback;
    if (profile.scoringEnv?.sprint) env.sprint = profile.sprint;
    else delete env.sprint;
    return env;
}
export function createAgentDecisionContextFrame(profileId) {
    const schema = getAgentProfile(profileId).decision;
    const visible = {};
    const remembered = {};
    const known = {};
    const candidateScores = {};
    for (const slotKey of Object.keys(schema.slots)) {
        visible[slotKey] = null;
        known[slotKey] = null;
    }
    for (const [fieldKey, fieldDef] of Object.entries(schema.fields ?? {})) {
        if (fieldDef.visible != null) visible[fieldKey] = fieldDef.visible.default ?? null;
        if (fieldDef.known != null) known[fieldKey] = fieldDef.known.default ?? null;
    }
    for (const slot of schema.remembered) remembered[slot.key] = slot.constant ?? null;
    for (const mode of schema.scoreOrder) candidateScores[mode] = -Infinity;
    return {
        visible,
        remembered,
        known,
        candidateScores,
        events: [],
        threatState: null,
        threatScratch: { dist: 0, severity: 0, lethal: false },
        allyState: { ally: null, dist: null, count: 0, centroid: null, visible: false, remembered: false, engagement: null, leadworthy: false },
        scoringEnv: { cohesion: {} },
        reachSteps: EMPTY_AGENT_REACH_STEPS,
        committedTarget: null,
        routeStatus: null,
        foodFraction: null,
        hungerTier: null,
        chosenIntent: null,
        chosenReason: null,
        targetId: null,
        sprintIntent: null,
        candidateScoreDetails: null,
        policyLatch: null,
        engagementState: null,
        safetyState: null,
        recentFailures: [],
        seekerFaction: null,
        seekerSegmentCount: null,
        combatState: null,
    };
}
export function buildAgentDecisionFrameInto(ctx, spec, input) {
    const schema = spec.decisionSchema();
    mergeSlotsFromSchemaInto(ctx, schema, input.visibleWorld, input.memoryWorld ?? null, input.memorySource ?? null, input);
    ctx.reachSteps = input.reachSteps ?? EMPTY_AGENT_REACH_STEPS;
    ctx.committedTarget = input.committedTarget ?? null;
    ctx.routeStatus = input.routeStatus ?? null;
    ctx.foodFraction = input.foodFraction ?? null;
    ctx.hungerTier = input.hungerTier ?? null;
    ctx.threatState = deriveThreatStateInto(ctx.threatScratch, input.visibleWorld?.threat, input.reachSteps?.threat, input.cellSize ?? 16, getSharedConfig());
    routeEventsInto(ctx.events, input.routeStatus);
    pushSchemaEventTargets(ctx.events, ctx.visible, ctx.remembered, input.visibleWorld, schema.eventTargets);
    for (const [mode, slotKey] of Object.entries(schema.targetLost)) if (!ctx.known[slotKey] && input.committedTarget?.mode === mode) ctx.events.push("TARGET_LOST");
    deriveAllyStateInto(ctx.allyState, input.visibleWorld, ctx.known, input.memorySource ?? null, spec.allySession?.(input) ?? null, ctx.reachSteps[spec.allyReachKey ?? "ally"]);
    const extra = spec.extraFacts?.(input);
    if (extra) {
        ctx.safetyState = extra.safetyState ?? null;
        ctx.recentFailures = extra.recentFailures ?? [];
        ctx.seekerFaction = extra.seekerFaction ?? null;
        ctx.seekerSegmentCount = extra.seekerSegmentCount ?? null;
        ctx.engagementState = extra.engagementState ?? null;
    }
    if (spec.deriveCombatState) ctx.combatState = spec.deriveCombatState(ctx, input);
    return ctx;
}
export function pickAgentIntentPolicy(ctx, scores, spec) {
    const schema = spec.decisionSchema();
    const mode = pickBestScoreKey(scores, schema.scoreOrder).chosenKey;
    if (mode === "flee") return intentPolicy("flee", null, policyReasonForTarget(ctx, "threat"));
    if (mode === "explore") return { mode: "explore", targetId: null };
    const slotKey = schema.targetLost[mode];
    if (!slotKey || !ctx.known[slotKey]) return { mode, targetId: null, reason: ctx.chosenReason ?? null };
    return intentPolicy(mode, ctx.known[slotKey].id, policyReasonForTarget(ctx, slotKey));
}
export function buildAgentDecisionContextInto(ctx, spec, input, { includeScoreDetails = false } = {}) {
    const schema = spec.decisionSchema();
    const foodFraction = input.foodFraction ?? null;
    const hungerTier = bandFromThresholds(foodFraction, spec.hungerBands());
    buildAgentDecisionFrameInto(ctx, spec, { ...input, foodFraction, hungerTier });
    const weights = spec.weights();
    const pressure = spec.pressure();
    writeScoringEnvInto(ctx.scoringEnv, getAgentProfile(spec.profileId));
    const details = scoreDecisionCandidateDetails(ctx, schema, weights, pressure, ctx.scoringEnv);
    const pickPolicy = input.pickPolicy ?? ((frame, scores) => pickAgentIntentPolicy(frame, scores, spec));
    if (includeScoreDetails) {
        const scored = scoreCandidateSet(details, schema.scoreOrder);
        for (const key of schema.scoreOrder) ctx.candidateScores[key] = scored.candidateScores[key];
        ctx.candidateScoreDetails = scored.candidateScoreDetails;
        ctx.chosenIntent = pickPolicy(ctx, ctx.candidateScores);
    } else {
        scoreCandidateNetsInto(ctx.candidateScores, details, schema.scoreOrder);
        ctx.candidateScoreDetails = null;
        ctx.chosenIntent = pickPolicy(ctx, ctx.candidateScores);
    }
    spec.afterPick?.(ctx, ctx.chosenIntent, input);
    ctx.sprintIntent = deriveSprintIntent(ctx.chosenIntent.mode, ctx, spec.sprintConfig());
    ctx.chosenReason = ctx.chosenIntent.reason ?? null;
    ctx.targetId = ctx.chosenIntent.targetId ?? null;
    return ctx;
}
export function buildAgentDecisionFrame(spec, input) {
    const ctx = createAgentDecisionContextFrame(spec.profileId);
    return buildAgentDecisionFrameInto(ctx, spec, input);
}
export function buildAgentDecisionContext(spec, input) {
    const ctx = createAgentDecisionContextFrame(spec.profileId);
    return buildAgentDecisionContextInto(ctx, spec, input, { includeScoreDetails: true });
}
