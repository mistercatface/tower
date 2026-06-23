import { isAgentEngaged } from "../../AI/agents/agentEngagement.js";
import { deriveAllyState } from "../../AI/agents/deriveAllyState.js";
import { deriveThreatState } from "../../AI/agents/deriveThreatState.js";
import { pushTargetEvents, routeEvents, intentPolicy, policyReasonForTarget } from "../../AI/agentIntent/targetEvents.js";
import { costPerCellForHunger, foodHungerScoreValue, hungerKey, netScoreDetail, pickBestScoreKey, scoreCandidateSet, scoreRiskAdjustedFlee } from "../../AI/utility/utilityScoring.js";
import { getSnakeGameConfig } from "./snakeGameConfig.js";
import { deriveSnakeEngagementState } from "./snakeEngagement.js";
export function deriveSnakeHungerState(foodFraction) {
    if (foodFraction == null) return null;
    const { satisfiedAtOrAbove, desperateBelow } = getSnakeGameConfig().hunger;
    let state = "hungry";
    if (foodFraction >= satisfiedAtOrAbove) state = "satisfied";
    else if (foodFraction < desperateBelow) state = "desperate";
    return { foodFraction, state, satisfied: state === "satisfied", hungry: state === "hungry", desperate: state === "desperate" };
}
function resolveKnownAlly(visibleWorld, remembered, memorySource, memoryWorld, session) {
    let ally = visibleWorld.ally;
    if (ally && session && !isAgentEngaged(session, ally.id)) ally = null;
    if (!ally && memorySource?.ally) ally = memoryWorld?.ally ?? remembered.ally ?? null;
    if (ally && session && !isAgentEngaged(session, ally.id)) ally = null;
    return ally;
}
export function deriveSprintIntent(mode, threatState) {
    if (mode === "flee" && threatState && (threatState.lethal || threatState.severity >= getSnakeGameConfig().sprint.fleeSeverity)) return { want: true, reason: "escape" };
    if (mode === "seek_food" && threatState && !threatState.lethal && threatState.severity >= getSnakeGameConfig().sprint.fleeSeverity) return { want: true, reason: "feed" };
    if (mode === "seek_prey") return { want: true, reason: "chase" };
    return { want: false, reason: "none" };
}
export function createSnakeDecisionBlackboard({
    visibleWorld,
    memoryWorld = null,
    memorySource = null,
    committedTarget = null,
    routeStatus = null,
    reachSteps = null,
    hungerState = null,
    threatState = null,
    safetyState = null,
    recentFailures = [],
    seekerFaction = null,
    seekerSegmentCount = null,
    session = null,
}) {
    const visible = {
        threat: visibleWorld.threat,
        prey: visibleWorld.prey,
        food: visibleWorld.food,
        ally: visibleWorld.ally,
        allyCount: visibleWorld.allyCount ?? 0,
        allyCentroid: visibleWorld.allyCentroid ?? null,
    };
    const remembered = {
        threat: memorySource?.threat ? (memoryWorld?.threat ?? null) : null,
        prey: memorySource?.prey ? (memoryWorld?.prey ?? null) : null,
        food: memorySource?.food ? (memoryWorld?.food ?? null) : null,
        ally: memorySource?.ally ? (memoryWorld?.ally ?? null) : null,
        allyCount: memorySource?.ally ? (memoryWorld?.allyCount ?? 1) : 0,
        allyCentroid: null,
    };
    const knownAlly = resolveKnownAlly(visibleWorld, remembered, memorySource, memoryWorld, session);
    const known = {
        threat: visibleWorld.threat ?? remembered.threat,
        prey: visibleWorld.prey ?? remembered.prey,
        food: visibleWorld.food ?? remembered.food,
        ally: knownAlly,
        allyCount: knownAlly ? (visibleWorld.ally?.id === knownAlly.id ? visible.allyCount : remembered.allyCount) : 0,
        allyCentroid: knownAlly && visibleWorld.ally?.id === knownAlly.id ? visible.allyCentroid : null,
    };
    const resolvedReachSteps = reachSteps ?? { threat: null, prey: null, food: null, ally: null };
    const events = routeEvents(routeStatus);
    pushTargetEvents(events, "threat", visibleWorld.threat, remembered.threat);
    pushTargetEvents(events, "prey", visibleWorld.prey, remembered.prey);
    pushTargetEvents(events, "food", visibleWorld.food, remembered.food);
    pushTargetEvents(events, "ally", visibleWorld.ally, remembered.ally);
    if (!known.prey && committedTarget?.mode === "seek_prey") events.push("TARGET_LOST");
    if (!known.food && committedTarget?.mode === "seek_food") events.push("TARGET_LOST");
    if (!known.ally && committedTarget?.mode === "seek_ally") events.push("TARGET_LOST");
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
            safetyState,
            recentFailures,
            seekerFaction,
            seekerSegmentCount,
            engagementState: null,
            allyState: deriveAllyState(visibleWorld, known, memorySource, session, resolvedReachSteps.ally),
        },
        events,
    };
}
function effortConfig(pressure) {
    return pressure.effort ?? getSnakeGameConfig().decisionPressure.effort;
}
function preyValueForHunger(weights, pressure, hungerState) {
    const effort = effortConfig(pressure);
    return effort.preyValue[hungerKey(hungerState)] ?? weights.prey;
}
function scorePreyDetail(blackboard, weights, pressure) {
    const prey = blackboard.facts.known.prey;
    if (!prey) return { net: -Infinity };
    const hunger = blackboard.facts.hungerState;
    let value = preyValueForHunger(weights, pressure, hunger);
    const isPreySnake = prey.type === "snake_head";
    const seekerFaction = blackboard.facts.seekerFaction;
    const isEnemySnake = isPreySnake && seekerFaction && prey.faction && prey.faction !== seekerFaction;
    if (isEnemySnake) value = pressure.enemySnakePreyValue ?? weights.prey + 1000;
    else if (hunger?.desperate && (!blackboard.facts.known.food || blackboard.facts.routeStatus?.routeFailed)) value += pressure.preyDesperationBonus;
    return netScoreDetail(value, blackboard.facts.reachSteps.prey, costPerCellForHunger(pressure, hunger));
}
function scoreFoodDetail(blackboard, weights, pressure) {
    if (!blackboard.facts.known.food) return { net: -Infinity };
    const hunger = blackboard.facts.hungerState;
    const value = foodHungerScoreValue(weights, pressure, hunger);
    return netScoreDetail(value, blackboard.facts.reachSteps.food, costPerCellForHunger(pressure, hunger));
}
function regroupSizeFactor(segmentCount, cohesion) {
    const count = segmentCount ?? cohesion.referenceSegmentCount ?? 3;
    const ref = cohesion.referenceSegmentCount ?? 3;
    const max = cohesion.maxSegmentScale ?? 12;
    if (count <= ref) return 1;
    if (count >= max) return 0;
    return 1 - (count - ref) / (max - ref);
}
function scoreSeekAllyDetail(blackboard, weights, pressure) {
    const ally = blackboard.facts.known.ally;
    if (!ally) return { net: -Infinity };
    if (!blackboard.facts.allyState?.leadworthy) return { net: -Infinity };
    if (blackboard.facts.known.threat) return { net: -Infinity };
    const hunger = blackboard.facts.hungerState;
    if (!hunger?.satisfied) return { net: -Infinity };
    const cohesion = getSnakeGameConfig().factionCohesion ?? {};
    const sizeFactor = regroupSizeFactor(blackboard.facts.seekerSegmentCount, cohesion);
    if (sizeFactor <= 0) return { net: -Infinity };
    const allyReach = blackboard.facts.reachSteps.ally;
    if (Number.isFinite(allyReach) && allyReach <= (cohesion.idealStopDist ?? 3)) return { net: -Infinity };
    let value = (weights.seek_ally ?? weights.explore) + (cohesion.satisfiedBonus ?? 50);
    value *= sizeFactor;
    const allyCount = blackboard.facts.known.allyCount ?? 1;
    if (allyCount > 1) value += (allyCount - 1) * (cohesion.packBonus ?? 15) * sizeFactor;
    return netScoreDetail(value, allyReach, costPerCellForHunger(pressure, hunger));
}
function scoreExplore(blackboard, weights) {
    return weights.explore;
}
export function scoreSnakeIntentCandidates(blackboard, weights = getSnakeGameConfig().decisionWeights, pressure = getSnakeGameConfig().decisionPressure) {
    return scoreCandidateSet(scoreSnakeIntentCandidateDetails(blackboard, weights, pressure), INTENT_SCORE_ORDER).candidateScores;
}
export function scoreSnakeIntentCandidateDetails(blackboard, weights = getSnakeGameConfig().decisionWeights, pressure = getSnakeGameConfig().decisionPressure) {
    return {
        flee: { net: scoreRiskAdjustedFlee(blackboard, weights, pressure) },
        seek_prey: scorePreyDetail(blackboard, weights, pressure),
        seek_food: scoreFoodDetail(blackboard, weights, pressure),
        seek_ally: scoreSeekAllyDetail(blackboard, weights, pressure),
        explore: { value: weights.explore, reach: null, cost: 0, net: scoreExplore(blackboard, weights) },
    };
}
const INTENT_SCORE_ORDER = ["flee", "seek_prey", "seek_food", "seek_ally", "explore"];
function policyForScoredMode(blackboard, mode) {
    if (mode === "flee") return intentPolicy("flee", null, policyReasonForTarget(blackboard, "threat"));
    if (mode === "seek_prey") return intentPolicy("seek_prey", blackboard.facts.known.prey.id, policyReasonForTarget(blackboard, "prey"));
    if (mode === "seek_food") return intentPolicy("seek_food", blackboard.facts.known.food.id, policyReasonForTarget(blackboard, "food"));
    if (mode === "seek_ally") return intentPolicy("seek_ally", blackboard.facts.known.ally.id, policyReasonForTarget(blackboard, "ally"));
    return { mode: "explore", targetId: null };
}
export function pickSnakeIntentPolicy(blackboard, scores = scoreSnakeIntentCandidates(blackboard)) {
    return policyForScoredMode(blackboard, pickBestScoreKey(scores, INTENT_SCORE_ORDER).chosenKey);
}
export function buildSnakeDecisionContext({
    visibleWorld,
    memoryWorld = null,
    memorySource = null,
    committedTarget = null,
    routeStatus = null,
    reachSteps = null,
    cellSize = 16,
    foodFraction = null,
    safetyState = null,
    recentFailures = [],
    seekerFaction = null,
    seekerSegmentCount = null,
    session = null,
    pickPolicy = pickSnakeIntentPolicy,
}) {
    const hungerState = deriveSnakeHungerState(foodFraction);
    const threatState = deriveThreatState(visibleWorld.threat, reachSteps?.threat, cellSize, getSnakeGameConfig());
    const blackboard = createSnakeDecisionBlackboard({
        visibleWorld,
        memoryWorld,
        memorySource,
        committedTarget,
        routeStatus,
        reachSteps,
        hungerState,
        threatState,
        safetyState,
        recentFailures,
        seekerFaction,
        seekerSegmentCount,
        session,
    });
    const scoredCandidates = scoreCandidateSet(scoreSnakeIntentCandidateDetails(blackboard), INTENT_SCORE_ORDER);
    const chosenIntent = pickPolicy(blackboard, scoredCandidates.candidateScores);
    blackboard.facts.engagementState = deriveSnakeEngagementState(blackboard, chosenIntent);
    const sprintIntent = deriveSprintIntent(chosenIntent.mode, threatState);
    const decisionSnapshot = {
        events: blackboard.events,
        hungerState,
        threatState,
        allyState: blackboard.facts.allyState,
        routeStatus,
        committedTarget,
        candidateScores: scoredCandidates.candidateScores,
        candidateScoreDetails: scoredCandidates.candidateScoreDetails,
        chosenIntent,
        chosenReason: chosenIntent.reason ?? null,
        targetId: chosenIntent.targetId ?? null,
        sprintIntent,
    };
    return { blackboard, decisionSnapshot };
}
