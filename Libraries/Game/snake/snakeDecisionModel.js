import { getSnakeGameConfig } from "./snakeGameConfig.js";
export function deriveSnakeHungerState(foodFraction) {
    if (foodFraction == null) return null;
    const { satisfiedAtOrAbove, desperateBelow } = getSnakeGameConfig().hunger;
    let state = "hungry";
    if (foodFraction >= satisfiedAtOrAbove) state = "satisfied";
    else if (foodFraction < desperateBelow) state = "desperate";
    return { foodFraction, state, satisfied: state === "satisfied", hungry: state === "hungry", desperate: state === "desperate" };
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
    safetyState = null,
    recentFailures = [],
}) {
    const remembered = {
        threat: memorySource?.threat ? (memoryWorld?.threat ?? null) : null,
        prey: memorySource?.prey ? (memoryWorld?.prey ?? null) : null,
        food: memorySource?.food ? (memoryWorld?.food ?? null) : null,
    };
    const known = { threat: visibleWorld.threat ?? remembered.threat, prey: visibleWorld.prey ?? remembered.prey, food: visibleWorld.food ?? remembered.food };
    const events = routeEvents(routeStatus);
    pushTargetEvents(events, "threat", visibleWorld.threat, remembered.threat);
    pushTargetEvents(events, "prey", visibleWorld.prey, remembered.prey);
    pushTargetEvents(events, "food", visibleWorld.food, remembered.food);
    if (!known.prey && committedTarget?.mode === "seek_prey") events.push("TARGET_LOST");
    if (!known.food && committedTarget?.mode === "seek_food") events.push("TARGET_LOST");
    return {
        facts: {
            visible: { threat: visibleWorld.threat, prey: visibleWorld.prey, food: visibleWorld.food },
            remembered,
            known,
            committedTarget,
            routeStatus,
            hungerState,
            safetyState,
            recentFailures,
        },
        events,
    };
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
function scoreFlee(blackboard, weights) {
    return blackboard.facts.known.threat ? weights.flee : -Infinity;
}
function scorePrey(blackboard, weights, pressure) {
    if (!blackboard.facts.known.prey) return -Infinity;
    const hunger = blackboard.facts.hungerState;
    if (hunger?.satisfied) return -Infinity;
    let score = weights.prey;
    const foodUnknown = !blackboard.facts.known.food;
    const routeFailed = !!blackboard.facts.routeStatus?.routeFailed;
    if (hunger?.desperate && (foodUnknown || routeFailed)) score += pressure.preyDesperationBonus;
    return score;
}
function scoreFood(blackboard, weights, pressure) {
    if (!blackboard.facts.known.food) return -Infinity;
    const hunger = blackboard.facts.hungerState;
    const deficit = hunger ? 1 - hunger.foodFraction : 0;
    return weights.food + pressure.foodHungerBonus * deficit;
}
function scoreExplore(blackboard, weights) {
    return weights.explore;
}
export function scoreSnakeIntentCandidates(blackboard, weights = getSnakeGameConfig().decisionWeights, pressure = getSnakeGameConfig().decisionPressure) {
    return {
        flee: scoreFlee(blackboard, weights),
        seek_prey: scorePrey(blackboard, weights, pressure),
        seek_food: scoreFood(blackboard, weights, pressure),
        explore: scoreExplore(blackboard, weights),
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
    let bestMode = "explore";
    let bestScore = -Infinity;
    for (const mode of INTENT_SCORE_ORDER)
        if (scores[mode] > bestScore) {
            bestScore = scores[mode];
            bestMode = mode;
        }
    return policyForScoredMode(blackboard, bestMode);
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
    pickPolicy = pickSnakeIntentPolicy,
}) {
    const hungerState = deriveSnakeHungerState(foodFraction);
    const blackboard = createSnakeDecisionBlackboard({ visibleWorld, memoryWorld, memorySource, committedTarget, routeStatus, hungerState, safetyState, recentFailures });
    const candidateScores = scoreSnakeIntentCandidates(blackboard);
    const chosenIntent = pickPolicy(blackboard, candidateScores);
    const decisionSnapshot = {
        events: blackboard.events,
        hungerState,
        routeStatus,
        committedTarget,
        candidateScores,
        chosenIntent,
        chosenReason: chosenIntent.reason ?? null,
        targetId: chosenIntent.targetId ?? null,
    };
    return { blackboard, decisionSnapshot };
}
