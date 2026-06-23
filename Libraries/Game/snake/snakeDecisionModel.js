import { isAgentEngaged } from "../../AI/agents/agentEngagement.js";
import { buildAgentDecisionContext, createAgentDecisionBlackboard, pickAgentIntentPolicy } from "../../AI/agents/buildAgentDecisionContext.js";
import { costPerCellForHunger, foodHungerScoreValue, hungerKey, netScoreDetail, scoreCandidateSet, scoreRiskAdjustedFlee } from "../../AI/utility/utilityScoring.js";
import { getSnakeGameConfig } from "./snakeGameConfig.js";
import { deriveSnakeEngagementState } from "./snakeEngagement.js";
const SCORE_ORDER = ["flee", "seek_prey", "seek_food", "seek_ally", "explore"];
export function deriveSnakeHungerState(foodFraction) {
    if (foodFraction == null) return null;
    const { satisfiedAtOrAbove, desperateBelow } = getSnakeGameConfig().hunger;
    let state = "hungry";
    if (foodFraction >= satisfiedAtOrAbove) state = "satisfied";
    else if (foodFraction < desperateBelow) state = "desperate";
    return { foodFraction, state, satisfied: state === "satisfied", hungry: state === "hungry", desperate: state === "desperate" };
}
export function deriveSprintIntent(mode, threatState) {
    if (mode === "flee" && threatState && (threatState.lethal || threatState.severity >= getSnakeGameConfig().sprint.fleeSeverity)) return { want: true, reason: "escape" };
    if (mode === "seek_food" && threatState && !threatState.lethal && threatState.severity >= getSnakeGameConfig().sprint.fleeSeverity) return { want: true, reason: "feed" };
    if (mode === "seek_prey") return { want: true, reason: "chase" };
    return { want: false, reason: "none" };
}
function resolveKnownAlly(visibleWorld, remembered, memorySource, memoryWorld, session) {
    let ally = visibleWorld.ally;
    if (ally && session && !isAgentEngaged(session, ally.id)) ally = null;
    if (!ally && memorySource?.ally) ally = memoryWorld?.ally ?? remembered.ally ?? null;
    if (ally && session && !isAgentEngaged(session, ally.id)) ally = null;
    return ally;
}
function effortConfig(pressure) {
    return pressure.effort ?? getSnakeGameConfig().decisionPressure.effort;
}
function preyValueForHunger(weights, pressure, hungerState) {
    return effortConfig(pressure).preyValue[hungerKey(hungerState)] ?? weights.prey;
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
export function scoreSnakeIntentCandidateDetails(blackboard, weights = getSnakeGameConfig().decisionWeights, pressure = getSnakeGameConfig().decisionPressure) {
    return {
        flee: { net: scoreRiskAdjustedFlee(blackboard, weights, pressure) },
        seek_prey: scorePreyDetail(blackboard, weights, pressure),
        seek_food: scoreFoodDetail(blackboard, weights, pressure),
        seek_ally: scoreSeekAllyDetail(blackboard, weights, pressure),
        explore: { value: weights.explore, reach: null, cost: 0, net: weights.explore },
    };
}
export function scoreSnakeIntentCandidates(blackboard, weights, pressure) {
    return scoreCandidateSet(scoreSnakeIntentCandidateDetails(blackboard, weights, pressure), SCORE_ORDER).candidateScores;
}
const snakeDecisionSpec = {
    scoreOrder: SCORE_ORDER,
    threatConfig: () => getSnakeGameConfig(),
    weights: () => getSnakeGameConfig().decisionWeights,
    pressure: () => getSnakeGameConfig().decisionPressure,
    defaultReachSteps: () => ({ threat: null, prey: null, food: null, ally: null }),
    allySession: (input) => input.session ?? null,
    targetLost: { seek_prey: "prey", seek_food: "food", seek_ally: "ally" },
    policySlot: { seek_prey: "prey", seek_food: "food", seek_ally: "ally" },
    buildVisible: (visibleWorld) => ({
        threat: visibleWorld.threat,
        prey: visibleWorld.prey,
        food: visibleWorld.food,
        ally: visibleWorld.ally,
        allyCount: visibleWorld.allyCount ?? 0,
        allyCentroid: visibleWorld.allyCentroid ?? null,
    }),
    buildRemembered: (memoryWorld, memorySource) => ({
        threat: memorySource?.threat ? (memoryWorld?.threat ?? null) : null,
        prey: memorySource?.prey ? (memoryWorld?.prey ?? null) : null,
        food: memorySource?.food ? (memoryWorld?.food ?? null) : null,
        ally: memorySource?.ally ? (memoryWorld?.ally ?? null) : null,
        allyCount: memorySource?.ally ? (memoryWorld?.allyCount ?? 1) : 0,
        allyCentroid: null,
    }),
    buildKnown: (visible, remembered, visibleWorld, input) => {
        const knownAlly = resolveKnownAlly(visibleWorld, remembered, input.memorySource, input.memoryWorld, input.session);
        return {
            threat: visibleWorld.threat ?? remembered.threat,
            prey: visibleWorld.prey ?? remembered.prey,
            food: visibleWorld.food ?? remembered.food,
            ally: knownAlly,
            allyCount: knownAlly ? (visibleWorld.ally?.id === knownAlly.id ? visible.allyCount : remembered.allyCount) : 0,
            allyCentroid: knownAlly && visibleWorld.ally?.id === knownAlly.id ? visible.allyCentroid : null,
        };
    },
    eventTargets: (_visible, remembered, visibleWorld) => [
        { kind: "threat", visibleTarget: visibleWorld.threat, rememberedTarget: remembered.threat },
        { kind: "prey", visibleTarget: visibleWorld.prey, rememberedTarget: remembered.prey },
        { kind: "food", visibleTarget: visibleWorld.food, rememberedTarget: remembered.food },
        { kind: "ally", visibleTarget: visibleWorld.ally, rememberedTarget: remembered.ally },
    ],
    extraFacts: (input) => ({
        safetyState: input.safetyState,
        recentFailures: input.recentFailures ?? [],
        seekerFaction: input.seekerFaction,
        seekerSegmentCount: input.seekerSegmentCount,
        engagementState: null,
    }),
    deriveHunger: deriveSnakeHungerState,
    deriveSprint: (mode, threatState) => deriveSprintIntent(mode, threatState),
    afterPick: (blackboard, chosenIntent) => {
        blackboard.facts.engagementState = deriveSnakeEngagementState(blackboard, chosenIntent);
    },
    scoreDetails: scoreSnakeIntentCandidateDetails,
};
export function createSnakeDecisionBlackboard(input) {
    return createAgentDecisionBlackboard(snakeDecisionSpec, input);
}
export function pickSnakeIntentPolicy(blackboard, scores = scoreSnakeIntentCandidates(blackboard)) {
    return pickAgentIntentPolicy(blackboard, scores, snakeDecisionSpec);
}
export function buildSnakeDecisionContext(input) {
    return buildAgentDecisionContext(snakeDecisionSpec, input);
}
