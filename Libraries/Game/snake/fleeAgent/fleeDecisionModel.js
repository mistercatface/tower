import { netScoreDetail, pickBestScoreKey, scoreCandidateSet } from "../../../AI/utility/utilityScoring.js";
import { deriveSnakeThreatState, deriveAllyState } from "../snakeDecisionModel.js";
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
    if (mode === "flee") {
        if (foodFraction < sprintFleeMin) return { want: false, reason: "starving" };
        if (threatState && (threatState.lethal || threatState.severity >= sprint.fleeSeverity)) return { want: true, reason: "escape" };
    }
    if (mode === "seek_food") {
        if (foodFraction < sprintFleeMin) return { want: false, reason: "starving" };
        if (threatState && !threatState.lethal && threatState.severity >= sprint.fleeSeverity && hungerState?.desperate) return { want: true, reason: "race" };
    }
    if (mode === "seek_enemy") return { want: true, reason: "attack" };
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
function pushTargetEvents(events, kind, visibleTarget, rememberedTarget) {
    const upper = kind.toUpperCase();
    if (visibleTarget) {
        events.push(`${upper}_SEEN`);
        return;
    }
    if (rememberedTarget) events.push(`${upper}_REMEMBERED`);
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
        enemy: memorySource?.prey ? null : (visibleWorld.prey ?? null),
        food: visibleWorld.food,
        threatDist: visibleWorld.threatDist ?? null,
        enemyDist: memorySource?.prey ? null : visibleWorld.prey ? (visibleWorld.preyDist ?? null) : null,
        foodDist: visibleWorld.food ? (visibleWorld.foodDist ?? null) : null,
        threatCount: visibleWorld.threatCount ?? 0,
        aggregateThreatSeverity: visibleWorld.aggregateThreatSeverity ?? 0,
        ally: memorySource?.ally ? null : (visibleWorld.ally ?? null),
        allyDist: memorySource?.ally ? null : visibleWorld.ally ? (visibleWorld.allyDist ?? null) : null,
        allyCount: memorySource?.ally ? 0 : (visibleWorld.allyCount ?? 0),
        allyCentroid: memorySource?.ally ? null : (visibleWorld.allyCentroid ?? null),
    };
    const remembered = {
        threat: memorySource?.threat ? (memoryWorld?.threat ?? null) : null,
        enemy: memorySource?.prey ? (memoryWorld?.prey ?? null) : null,
        food: memorySource?.food ? (memoryWorld?.food ?? null) : null,
        ally: memorySource?.ally ? (memoryWorld?.ally ?? null) : null,
        enemyDist: memorySource?.prey ? (memoryWorld?.preyDist ?? null) : null,
        foodDist: memorySource?.food ? (memoryWorld?.foodDist ?? null) : null,
        allyDist: memorySource?.ally ? (memoryWorld?.allyDist ?? null) : null,
        allyCount: memorySource?.ally ? (memoryWorld?.allyCount ?? 1) : 0,
        allyCentroid: null,
    };
    const known = {
        threat: visibleWorld.threat ?? remembered.threat,
        enemy: visible.enemy ?? remembered.enemy,
        food: visibleWorld.food ?? remembered.food,
        ally: visibleWorld.ally ?? remembered.ally,
        threatDist: visible.threatDist,
        enemyDist: visible.enemy ? visible.enemyDist : remembered.enemyDist,
        foodDist: visible.food ? visible.foodDist : remembered.foodDist,
        allyDist: visible.ally ? visible.allyDist : remembered.allyDist,
        threatCount: visible.threatCount ?? 0,
        aggregateThreatSeverity: visible.aggregateThreatSeverity ?? 0,
        allyCount: visible.ally ? visible.allyCount : remembered.allyCount,
        allyCentroid: visible.allyCentroid,
    };
    const events = routeEvents(routeStatus);
    pushTargetEvents(events, "threat", visibleWorld.threat, remembered.threat);
    pushTargetEvents(events, "enemy", visible.enemy ?? visibleWorld.prey, remembered.enemy);
    pushTargetEvents(events, "food", visibleWorld.food, remembered.food);
    pushTargetEvents(events, "ally", visible.ally ?? visibleWorld.ally, remembered.ally);
    if (!known.enemy && committedTarget?.mode === "seek_enemy") events.push("TARGET_LOST");
    if (!known.food && committedTarget?.mode === "seek_food") events.push("TARGET_LOST");
    if (!known.ally && committedTarget?.mode === "seek_ally") events.push("TARGET_LOST");
    return { facts: { visible, remembered, known, committedTarget, routeStatus, hungerState, threatState, allyState: deriveAllyState(visibleWorld, known, memorySource) }, events };
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
function scoreEnemyDetail(blackboard, weights, pressure) {
    if (!blackboard.facts.known.enemy) return { net: -Infinity };
    if (blackboard.facts.known.threat) return { net: -Infinity };
    const value = weights.enemy ?? weights.explore;
    return netScoreDetail(value, reachForCandidate(blackboard, "seek_enemy", "enemy"), costPerCellForHunger(pressure, blackboard.facts.hungerState));
}
function scoreSeekAllyDetail(blackboard, weights, pressure) {
    const ally = blackboard.facts.known.ally;
    if (!ally) return { net: -Infinity };
    if (blackboard.facts.known.threat) return { net: -Infinity };
    const hunger = blackboard.facts.hungerState;
    if (hunger?.desperate) return { net: -Infinity };
    const cohesion = getSnakeGameConfig().fleeAgent.factionCohesion ?? {};
    const allyDist = blackboard.facts.known.allyDist;
    if (Number.isFinite(allyDist) && allyDist <= (cohesion.idealStopDist ?? 40)) return { net: -Infinity };
    let value = weights.seek_ally ?? weights.explore;
    if (hunger?.satisfied) value += cohesion.satisfiedBonus ?? pressure.allySatisfiedBonus ?? 60;
    const allyCount = blackboard.facts.known.allyCount ?? 1;
    if (allyCount > 1) value += (allyCount - 1) * (cohesion.packBonus ?? pressure.allyPackBonus ?? 20);
    const reach = reachForCandidate(blackboard, "seek_ally", "ally") ?? (Number.isFinite(allyDist) ? allyDist : null);
    return netScoreDetail(value, reach, costPerCellForHunger(pressure, hunger));
}
function scoreExplore(weights) {
    return weights.explore;
}
const FLEE_INTENT_SCORE_ORDER = ["flee", "seek_enemy", "seek_food", "seek_ally", "explore"];
export function scoreFleeIntentCandidateDetails(blackboard, weights = fleeWeights(), pressure = fleePressure()) {
    return {
        flee: { net: scoreFlee(blackboard, weights, pressure) },
        seek_enemy: scoreEnemyDetail(blackboard, weights, pressure),
        seek_food: scoreFoodDetail(blackboard, weights, pressure),
        seek_ally: scoreSeekAllyDetail(blackboard, weights, pressure),
        explore: { value: weights.explore, reach: null, cost: 0, net: scoreExplore(weights) },
    };
}
function policyForScoredMode(blackboard, mode) {
    if (mode === "flee") return intentPolicy("flee", null, policyReasonForTarget(blackboard, "threat"));
    if (mode === "seek_enemy") return intentPolicy("seek_enemy", blackboard.facts.known.enemy.id, policyReasonForTarget(blackboard, "enemy"));
    if (mode === "seek_food") return intentPolicy("seek_food", blackboard.facts.known.food.id, policyReasonForTarget(blackboard, "food"));
    if (mode === "seek_ally") return intentPolicy("seek_ally", blackboard.facts.known.ally.id, policyReasonForTarget(blackboard, "ally"));
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
        allyState: blackboard.facts.allyState,
        enemy: blackboard.facts.known.enemy,
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
