import { netScoreDetail, pickBestScoreKey, scoreCandidateSet } from "../../../AI/utility/utilityScoring.js";
import { deriveSnakeThreatState } from "../snakeDecisionModel.js";
import { getSnakeGameConfig } from "../snakeGameConfig.js";
export function deriveFleeAgentThreatState(threat, threatDist) {
    return deriveSnakeThreatState(threat, threatDist);
}
export function deriveFleeHungerState(foodFraction) {
    if (foodFraction == null) return null;
    const { satisfiedAtOrAbove, desperateBelow } = getSnakeGameConfig().fleeAgent.hunger;
    let state = "hungry";
    if (foodFraction >= satisfiedAtOrAbove) state = "satisfied";
    else if (foodFraction < desperateBelow) state = "desperate";
    return { foodFraction, state, satisfied: state === "satisfied", hungry: state === "hungry", desperate: state === "desperate" };
}
export function deriveFleeSprintIntent(mode, threatState, hungerState = null) {
    const fleeConfig = getSnakeGameConfig().fleeAgent;
    const pressure = fleeConfig.decisionPressure;
    const sprint = fleeConfig.sprint;
    const foodFraction = hungerState?.foodFraction ?? 1;
    const sprintFleeMin = sprint.sprintFleeMinHunger ?? pressure.sprintFleeMinHunger ?? 0.1;
    const huntMin = pressure.huntMinHunger ?? 0.25;
    if (mode === "flee") {
        if (foodFraction < sprintFleeMin) return { want: false, reason: "starving" };
        if (threatState && (threatState.lethal || threatState.severity >= sprint.fleeSeverity)) return { want: true, reason: "escape" };
    }
    if (mode === "hunt") {
        if (foodFraction < huntMin) return { want: false, reason: "reserve" };
        return { want: true, reason: "murder" };
    }
    if (mode === "seek_food") {
        if (foodFraction < sprintFleeMin) return { want: false, reason: "starving" };
        if (threatState && !threatState.lethal && threatState.severity >= sprint.fleeSeverity && hungerState?.desperate) return { want: true, reason: "race" };
    }
    return { want: false, reason: "none" };
}
function fleeWeights() {
    return getSnakeGameConfig().fleeAgent.decisionWeights;
}
function fleePressure() {
    return getSnakeGameConfig().fleeAgent.decisionPressure;
}
function hungerKey(hungerState) {
    return hungerState?.state ?? "hungry";
}
function costPerCellForHunger(pressure, hungerState) {
    return pressure.effort.costPerCell[hungerKey(hungerState)];
}
function huntValueForHunger(weights, pressure, hungerState) {
    const effort = pressure.effort;
    return effort.huntValue?.[hungerKey(hungerState)] ?? weights.hunt;
}
function pushTargetEvents(events, kind, visibleTarget, rememberedTarget) {
    const upper = kind.toUpperCase();
    if (visibleTarget) {
        events.push(`${upper}_SEEN`);
        return;
    }
    if (rememberedTarget) events.push(kind === "prey" ? "PREY_LAST_SEEN_ACTIVE" : `${upper}_REMEMBERED`);
}
function routeEvents(routeStatus) {
    const events = [];
    if (!routeStatus) return events;
    if (routeStatus.routeFailed) events.push("ROUTE_FAILED");
    if (routeStatus.destReached) events.push("DEST_REACHED");
    return events;
}
function committedTargetMatches(blackboard, mode, target) {
    const committed = blackboard.facts.committedTarget;
    return committed?.mode === mode && committed.targetId === target?.id;
}
function reachForCandidate(blackboard, mode, kind) {
    const target = blackboard.facts.known[kind];
    if (!target) return null;
    if (committedTargetMatches(blackboard, mode, target)) {
        const pathLen = blackboard.facts.routeStatus?.pathLen;
        if (Number.isFinite(pathLen)) return pathLen;
    }
    const dist = blackboard.facts.known[`${kind}Dist`];
    return Number.isFinite(dist) ? dist : null;
}
function policyReasonForTarget(blackboard, kind) {
    if (blackboard.facts.remembered[kind]) return `${kind}_memory`;
    return null;
}
function intentPolicy(mode, targetId, reason = null) {
    const policy = { mode, targetId };
    if (reason) policy.reason = reason;
    return policy;
}
function createFleeDecisionBlackboard({ visibleWorld, memoryWorld = null, memorySource = null, committedTarget = null, routeStatus = null, hungerState = null, threatState = null }) {
    const visible = {
        threat: visibleWorld.threat,
        prey: visibleWorld.prey,
        food: visibleWorld.food,
        threatDist: visibleWorld.threatDist ?? null,
        preyDist: visibleWorld.prey ? (visibleWorld.preyDist ?? null) : null,
        preySegmentCount: visibleWorld.prey ? (visibleWorld.preySegmentCount ?? null) : null,
        foodDist: visibleWorld.food ? (visibleWorld.foodDist ?? null) : null,
        threatCount: visibleWorld.threatCount ?? 0,
        aggregateThreatSeverity: visibleWorld.aggregateThreatSeverity ?? 0,
    };
    const remembered = {
        threat: memorySource?.threat ? (memoryWorld?.threat ?? null) : null,
        prey: memorySource?.prey ? (memoryWorld?.prey ?? null) : null,
        food: memorySource?.food ? (memoryWorld?.food ?? null) : null,
        preyDist: memorySource?.prey ? (memoryWorld?.preyDist ?? null) : null,
        foodDist: memorySource?.food ? (memoryWorld?.foodDist ?? null) : null,
    };
    const knownPrey = visibleWorld.prey ?? remembered.prey;
    const known = {
        threat: visibleWorld.threat ?? remembered.threat,
        prey: knownPrey,
        food: visibleWorld.food ?? remembered.food,
        threatDist: visible.threatDist,
        preyDist: visible.prey ? visible.preyDist : remembered.preyDist,
        preySegmentCount: visible.preySegmentCount ?? memoryWorld?.preySegmentCount ?? null,
        foodDist: visible.food ? visible.foodDist : remembered.foodDist,
        threatCount: visible.threatCount ?? 0,
        aggregateThreatSeverity: visible.aggregateThreatSeverity ?? 0,
    };
    const events = routeEvents(routeStatus);
    pushTargetEvents(events, "threat", visibleWorld.threat, remembered.threat);
    pushTargetEvents(events, "prey", visibleWorld.prey, remembered.prey);
    pushTargetEvents(events, "food", visibleWorld.food, remembered.food);
    if (!known.prey && committedTarget?.mode === "hunt") events.push("TARGET_LOST");
    if (!known.food && committedTarget?.mode === "seek_food") events.push("TARGET_LOST");
    return { facts: { visible, remembered, known, committedTarget, routeStatus, hungerState, threatState }, events };
}
function scoreFlee(blackboard, weights, pressure) {
    if (!blackboard.facts.known.threat) return -Infinity;
    const threat = blackboard.facts.threatState;
    if (!threat || threat.lethal) return Infinity;
    const hunger = blackboard.facts.hungerState;
    const riskTolerance = hunger ? (pressure.riskTolerance[hunger.state] ?? 0) : 0;
    if (riskTolerance <= 0) return Infinity;
    let score = weights.flee * threat.severity * (1 - riskTolerance);
    const threatCount = blackboard.facts.known.threatCount ?? 1;
    if (threatCount > 1) score *= 1 + (threatCount - 1) * (pressure.outnumberedFleeBonus ?? 0);
    return score;
}
function scoreHuntDetail(blackboard, weights, pressure) {
    const prey = blackboard.facts.known.prey;
    if (!prey) return { net: -Infinity };
    const hunger = blackboard.facts.hungerState;
    if (!hunger || hunger.foodFraction < (pressure.huntMinHunger ?? 0.25)) return { net: -Infinity };
    let value = huntValueForHunger(weights, pressure, hunger);
    const preySegments = blackboard.facts.known.preySegmentCount;
    const easyPreyMax = pressure.easyPreyMaxSegments ?? 3;
    if (Number.isFinite(preySegments) && preySegments <= easyPreyMax) value += pressure.easyPreyBonus ?? 0;
    const threat = blackboard.facts.threatState;
    if (blackboard.facts.known.threat && threat) {
        value -= (pressure.huntThreatPenalty ?? 0) * threat.severity;
        const threatCount = blackboard.facts.known.threatCount ?? 1;
        if (threatCount > 1) value -= (pressure.huntThreatPenalty ?? 0) * 0.5 * (threatCount - 1);
    }
    return netScoreDetail(value, reachForCandidate(blackboard, "hunt", "prey"), costPerCellForHunger(pressure, hunger));
}
function scoreFoodDetail(blackboard, weights, pressure) {
    if (!blackboard.facts.known.food) return { net: -Infinity };
    const hunger = blackboard.facts.hungerState;
    if (hunger?.satisfied) return { net: -Infinity };
    const deficit = hunger ? 1 - hunger.foodFraction : 0;
    let value = weights.food + pressure.foodHungerBonus * deficit;
    const threat = blackboard.facts.threatState;
    const sprint = getSnakeGameConfig().fleeAgent.sprint;
    if (threat && !threat.lethal && threat.severity >= sprint.fleeSeverity) value -= pressure.sprintFoodCostPenalty ?? 0;
    return netScoreDetail(value, reachForCandidate(blackboard, "seek_food", "food"), costPerCellForHunger(pressure, hunger));
}
function scoreExplore(weights) {
    return weights.explore;
}
const FLEE_INTENT_SCORE_ORDER = ["flee", "hunt", "seek_food", "explore"];
export function scoreFleeIntentCandidateDetails(blackboard, weights = fleeWeights(), pressure = fleePressure()) {
    return {
        flee: { net: scoreFlee(blackboard, weights, pressure) },
        hunt: scoreHuntDetail(blackboard, weights, pressure),
        seek_food: scoreFoodDetail(blackboard, weights, pressure),
        explore: { value: weights.explore, reach: null, cost: 0, net: scoreExplore(weights) },
    };
}
function policyForScoredMode(blackboard, mode) {
    if (mode === "flee") return intentPolicy("flee", null, policyReasonForTarget(blackboard, "threat"));
    if (mode === "hunt") return intentPolicy("hunt", blackboard.facts.known.prey.id, policyReasonForTarget(blackboard, "prey"));
    if (mode === "seek_food") return intentPolicy("seek_food", blackboard.facts.known.food.id, policyReasonForTarget(blackboard, "food"));
    return { mode: "explore", targetId: null };
}
export function pickFleeIntentPolicy(blackboard, scores = scoreCandidateSet(scoreFleeIntentCandidateDetails(blackboard)).candidateScores) {
    return policyForScoredMode(blackboard, pickBestScoreKey(scores, FLEE_INTENT_SCORE_ORDER).chosenKey);
}
export function buildFleeDecisionContext({
    visibleWorld,
    memoryWorld = null,
    memorySource = null,
    committedTarget = null,
    routeStatus = null,
    foodFraction = null,
    pickPolicy = pickFleeIntentPolicy,
}) {
    const hungerState = deriveFleeHungerState(foodFraction);
    const threatState = deriveFleeAgentThreatState(visibleWorld.threat, visibleWorld.threatDist);
    const blackboard = createFleeDecisionBlackboard({ visibleWorld, memoryWorld, memorySource, committedTarget, routeStatus, hungerState, threatState });
    const scoredCandidates = scoreCandidateSet(scoreFleeIntentCandidateDetails(blackboard), FLEE_INTENT_SCORE_ORDER);
    const chosenIntent = pickPolicy(blackboard, scoredCandidates.candidateScores);
    const sprintIntent = deriveFleeSprintIntent(chosenIntent.mode, threatState, hungerState);
    const decisionSnapshot = {
        events: blackboard.events,
        hungerState,
        threatState,
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
