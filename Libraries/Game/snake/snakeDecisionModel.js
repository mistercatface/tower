import { netScoreDetail, pickBestScoreKey, scoreCandidateSet } from "../../AI/utility/utilityScoring.js";
import { getSnakeGameConfig } from "./snakeGameConfig.js";
export function deriveSnakeHungerState(foodFraction) {
    if (foodFraction == null) return null;
    const { satisfiedAtOrAbove, desperateBelow } = getSnakeGameConfig().hunger;
    let state = "hungry";
    if (foodFraction >= satisfiedAtOrAbove) state = "satisfied";
    else if (foodFraction < desperateBelow) state = "desperate";
    return { foodFraction, state, satisfied: state === "satisfied", hungry: state === "hungry", desperate: state === "desperate" };
}
export function deriveSnakeThreatState(visibleThreat, threatDist) {
    if (!visibleThreat || threatDist == null) return null;
    const config = getSnakeGameConfig();
    const fleeRange = config.fleeRange ?? config.visionCone.range;
    const severity = Math.max(0, Math.min(1, (fleeRange - threatDist) / fleeRange));
    return { dist: threatDist, severity, lethal: threatDist <= config.lethalThreatRange };
}
export function deriveSprintIntent(mode, threatState) {
    if (mode === "flee" && threatState && (threatState.lethal || threatState.severity >= getSnakeGameConfig().sprint.fleeSeverity)) return { want: true, reason: "escape" };
    if (mode === "seek_food" && threatState && !threatState.lethal && threatState.severity >= getSnakeGameConfig().sprint.fleeSeverity) return { want: true, reason: "feed" };
    if (mode === "seek_prey") return { want: true, reason: "chase" };
    return { want: false, reason: "none" };
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
export function createSnakeDecisionBlackboard({
    visibleWorld,
    memoryWorld = null,
    memorySource = null,
    committedTarget = null,
    routeStatus = null,
    hungerState = null,
    threatState = null,
    safetyState = null,
    recentFailures = [],
    seekerFaction = null,
}) {
    const visible = {
        threat: visibleWorld.threat,
        prey: visibleWorld.prey,
        food: visibleWorld.food,
        threatDist: visibleWorld.threatDist ?? null,
        preyDist: visibleWorld.prey ? (visibleWorld.preyDist ?? null) : null,
        foodDist: visibleWorld.food ? (visibleWorld.foodDist ?? null) : null,
    };
    const remembered = {
        threat: memorySource?.threat ? (memoryWorld?.threat ?? null) : null,
        prey: memorySource?.prey ? (memoryWorld?.prey ?? null) : null,
        food: memorySource?.food ? (memoryWorld?.food ?? null) : null,
        preyDist: memorySource?.prey ? (memoryWorld?.preyDist ?? null) : null,
        foodDist: memorySource?.food ? (memoryWorld?.foodDist ?? null) : null,
    };
    const known = {
        threat: visibleWorld.threat ?? remembered.threat,
        prey: visibleWorld.prey ?? remembered.prey,
        food: visibleWorld.food ?? remembered.food,
        threatDist: visible.threatDist,
        preyDist: visible.prey ? visible.preyDist : remembered.preyDist,
        foodDist: visible.food ? visible.foodDist : remembered.foodDist,
    };
    const events = routeEvents(routeStatus);
    pushTargetEvents(events, "threat", visibleWorld.threat, remembered.threat);
    pushTargetEvents(events, "prey", visibleWorld.prey, remembered.prey);
    pushTargetEvents(events, "food", visibleWorld.food, remembered.food);
    if (!known.prey && committedTarget?.mode === "seek_prey") events.push("TARGET_LOST");
    if (!known.food && committedTarget?.mode === "seek_food") events.push("TARGET_LOST");
    return { facts: { visible, remembered, known, committedTarget, routeStatus, hungerState, threatState, safetyState, recentFailures, seekerFaction }, events };
}
function hungerKey(hungerState) {
    return hungerState?.state ?? "hungry";
}
function effortConfig(pressure) {
    return pressure.effort ?? getSnakeGameConfig().decisionPressure.effort;
}
function costPerCellForHunger(pressure, hungerState) {
    const effort = effortConfig(pressure);
    return effort.costPerCell[hungerKey(hungerState)];
}
function preyValueForHunger(weights, pressure, hungerState) {
    const effort = effortConfig(pressure);
    return effort.preyValue[hungerKey(hungerState)] ?? weights.prey;
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
function scoreFlee(blackboard, weights, pressure) {
    if (!blackboard.facts.known.threat) return -Infinity;
    const threat = blackboard.facts.threatState;
    if (!threat || threat.lethal) return Infinity;
    const hunger = blackboard.facts.hungerState;
    const riskTolerance = hunger ? (pressure.riskTolerance[hunger.state] ?? 0) : 0;
    if (riskTolerance <= 0) return Infinity;
    return weights.flee * threat.severity * (1 - riskTolerance);
}
function scorePreyDetail(blackboard, weights, pressure) {
    const prey = blackboard.facts.known.prey;
    if (!prey) return { net: -Infinity };
    const hunger = blackboard.facts.hungerState;
    let value = preyValueForHunger(weights, pressure, hunger);
    // Check if prey is a snake on the opposite team
    const isPreySnake = prey.type === "snake_head";
    const isEnemySnake = isPreySnake && blackboard.facts.seekerFaction && prey.faction !== blackboard.facts.seekerFaction;
    if (isEnemySnake)
        // Attack no matter what! Massive value boost
        value = weights.prey + 1000;
    else {
        const foodUnknown = !blackboard.facts.known.food;
        const routeFailed = !!blackboard.facts.routeStatus?.routeFailed;
        if (hunger?.desperate && (foodUnknown || routeFailed)) value += pressure.preyDesperationBonus;
    }
    return netScoreDetail(value, reachForCandidate(blackboard, "seek_prey", "prey"), costPerCellForHunger(pressure, hunger));
}
function scoreFoodDetail(blackboard, weights, pressure) {
    if (!blackboard.facts.known.food) return { net: -Infinity };
    const hunger = blackboard.facts.hungerState;
    const deficit = hunger ? 1 - hunger.foodFraction : 0;
    const value = weights.food + pressure.foodHungerBonus * deficit;
    return netScoreDetail(value, reachForCandidate(blackboard, "seek_food", "food"), costPerCellForHunger(pressure, hunger));
}
function scoreExplore(blackboard, weights) {
    return weights.explore;
}
export function scoreSnakeIntentCandidates(blackboard, weights = getSnakeGameConfig().decisionWeights, pressure = getSnakeGameConfig().decisionPressure) {
    return scoreCandidateSet(scoreSnakeIntentCandidateDetails(blackboard, weights, pressure), INTENT_SCORE_ORDER).candidateScores;
}
export function scoreSnakeIntentCandidateDetails(blackboard, weights = getSnakeGameConfig().decisionWeights, pressure = getSnakeGameConfig().decisionPressure) {
    return {
        flee: { net: scoreFlee(blackboard, weights, pressure) },
        seek_prey: scorePreyDetail(blackboard, weights, pressure),
        seek_food: scoreFoodDetail(blackboard, weights, pressure),
        explore: { value: weights.explore, reach: null, cost: 0, net: scoreExplore(blackboard, weights) },
    };
}
const INTENT_SCORE_ORDER = ["flee", "seek_prey", "seek_food", "explore"];
function policyForScoredMode(blackboard, mode) {
    if (mode === "flee") return intentPolicy("flee", null, policyReasonForTarget(blackboard, "threat"));
    if (mode === "seek_prey") return intentPolicy("seek_prey", blackboard.facts.known.prey.id, policyReasonForTarget(blackboard, "prey"));
    if (mode === "seek_food") return intentPolicy("seek_food", blackboard.facts.known.food.id, policyReasonForTarget(blackboard, "food"));
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
    foodFraction = null,
    safetyState = null,
    recentFailures = [],
    seekerFaction = null,
    pickPolicy = pickSnakeIntentPolicy,
}) {
    const hungerState = deriveSnakeHungerState(foodFraction);
    const threatState = deriveSnakeThreatState(visibleWorld.threat, visibleWorld.threatDist);
    const blackboard = createSnakeDecisionBlackboard({ visibleWorld, memoryWorld, memorySource, committedTarget, routeStatus, hungerState, threatState, safetyState, recentFailures, seekerFaction });
    const scoredCandidates = scoreCandidateSet(scoreSnakeIntentCandidateDetails(blackboard), INTENT_SCORE_ORDER);
    const chosenIntent = pickPolicy(blackboard, scoredCandidates.candidateScores);
    const sprintIntent = deriveSprintIntent(chosenIntent.mode, threatState);
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
