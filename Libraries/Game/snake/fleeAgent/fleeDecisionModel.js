import { buildAgentDecisionContext } from "../../../AI/agents/buildAgentDecisionContext.js";
import { costPerCellForHunger, foodHungerScoreValue, netScoreDetail, netScoreOnly, resetScoreDetailScratch, SCORE_ABSENT, scoreRiskAdjustedFlee } from "../../../AI/utility/utilityScoring.js";
import { getSnakeGameConfig } from "../snakeGameConfig.js";
const SCORE_ORDER = ["flee", "seek_enemy", "seek_food", "seek_ally", "explore"];
const FLEE_REMEMBERED_SLOTS = [{ key: "threat" }, { key: "enemy", memoryKey: "prey" }, { key: "food" }, { key: "ally" }, { key: "allyCount", allyCount: 1 }, { key: "allyCentroid", constant: null }];
const FLEE_EVENT_TARGET_SLOTS = [
    "threat",
    "food",
    { kind: "enemy", visible: (visible, _remembered, visibleWorld) => visible.enemy ?? visibleWorld.prey },
    { kind: "ally", visible: (visible, _remembered, visibleWorld) => visible.ally ?? visibleWorld.ally },
];
export function deriveFleeSprintIntent(mode, threatState, hungerTier = null, foodFraction = null) {
    const fleeConfig = getSnakeGameConfig().fleeAgent;
    const pressure = fleeConfig.decisionPressure;
    const sprint = fleeConfig.sprint;
    const fraction = foodFraction ?? 1;
    const sprintFleeMin = sprint.sprintFleeMinHunger ?? pressure.sprintFleeMinHunger ?? 0.1;
    if (mode === "flee") {
        if (fraction < sprintFleeMin) return { want: false, reason: "starving" };
        if (threatState && (threatState.lethal || threatState.severity >= sprint.fleeSeverity)) return { want: true, reason: "escape" };
    }
    if (mode === "seek_food") {
        if (fraction < sprintFleeMin) return { want: false, reason: "starving" };
        if (threatState && !threatState.lethal && threatState.severity >= sprint.fleeSeverity && hungerTier === "desperate") return { want: true, reason: "race" };
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
function scoreFlee(ctx, weights, pressure) {
    let score = scoreRiskAdjustedFlee(ctx, weights, pressure);
    if (!Number.isFinite(score)) return score;
    const threatCount = ctx.known.threatCount ?? 1;
    if (threatCount > 1) score *= 1 + (threatCount - 1) * (pressure.outnumberedFleeBonus ?? 0);
    return score;
}
function scoreFoodDetail(ctx, weights, pressure) {
    if (!ctx.known.food) return SCORE_ABSENT;
    if (ctx.hungerTier === "satisfied") return SCORE_ABSENT;
    let value = foodHungerScoreValue(weights, pressure, ctx.foodFraction);
    const threat = ctx.threatState;
    const sprint = getSnakeGameConfig().fleeAgent.sprint;
    if (threat && !threat.lethal && threat.severity >= sprint.fleeSeverity) value -= pressure.sprintFoodCostPenalty ?? 0;
    return netScoreDetail(value, ctx.reachSteps.food, costPerCellForHunger(pressure, ctx.hungerTier));
}
function scoreEnemyDetail(ctx, weights, pressure) {
    if (!ctx.known.enemy) return SCORE_ABSENT;
    if (ctx.known.threat) return SCORE_ABSENT;
    const value = weights.enemy ?? weights.explore;
    return netScoreDetail(value, ctx.reachSteps.enemy, costPerCellForHunger(pressure, ctx.hungerTier));
}
function scoreSeekAllyDetail(ctx, weights, pressure) {
    const ally = ctx.known.ally;
    if (!ally) return SCORE_ABSENT;
    if (ctx.known.threat) return SCORE_ABSENT;
    const hungerTier = ctx.hungerTier;
    if (hungerTier === "desperate") return SCORE_ABSENT;
    const cohesion = getSnakeGameConfig().fleeAgent.factionCohesion ?? {};
    const allyReach = ctx.reachSteps.ally;
    if (Number.isFinite(allyReach) && allyReach <= (cohesion.idealStopDist ?? 40)) return SCORE_ABSENT;
    let value = weights.seek_ally ?? weights.explore;
    if (hungerTier === "satisfied") value += cohesion.satisfiedBonus ?? pressure.allySatisfiedBonus ?? 60;
    const allyCount = ctx.known.allyCount ?? 1;
    if (allyCount > 1) value += (allyCount - 1) * (cohesion.packBonus ?? pressure.allyPackBonus ?? 20);
    return netScoreDetail(value, allyReach, costPerCellForHunger(pressure, hungerTier));
}
export function scoreFleeIntentCandidateDetails(ctx, weights = fleeWeights(), pressure = fleePressure()) {
    resetScoreDetailScratch();
    return {
        flee: netScoreOnly(scoreFlee(ctx, weights, pressure)),
        seek_enemy: scoreEnemyDetail(ctx, weights, pressure),
        seek_food: scoreFoodDetail(ctx, weights, pressure),
        seek_ally: scoreSeekAllyDetail(ctx, weights, pressure),
        explore: netScoreDetail(weights.explore, null, 0),
    };
}
const fleeDecisionSpec = {
    scoreOrder: SCORE_ORDER,
    hungerSatisfiedAt: () => getSnakeGameConfig().fleeAgent.hunger.satisfiedAtOrAbove,
    hungerDesperateBelow: () => getSnakeGameConfig().fleeAgent.hunger.desperateBelow,
    threatConfig: () => getSnakeGameConfig(),
    weights: fleeWeights,
    pressure: fleePressure,
    targetLost: { seek_enemy: "enemy", seek_food: "food", seek_ally: "ally" },
    rememberedSlots: FLEE_REMEMBERED_SLOTS,
    eventTargetSlots: FLEE_EVENT_TARGET_SLOTS,
    buildVisible: (visibleWorld, memorySource) => ({
        threat: visibleWorld.threat,
        enemy: memorySource?.prey ? null : (visibleWorld.prey ?? null),
        food: visibleWorld.food,
        threatCount: visibleWorld.threatCount ?? 0,
        ally: memorySource?.ally ? null : (visibleWorld.ally ?? null),
        allyCount: memorySource?.ally ? 0 : (visibleWorld.allyCount ?? 0),
        allyCentroid: memorySource?.ally ? null : (visibleWorld.allyCentroid ?? null),
    }),
    buildKnown: (visible, remembered, visibleWorld) => ({
        threat: visibleWorld.threat ?? remembered.threat,
        enemy: visible.enemy ?? remembered.enemy,
        food: visibleWorld.food ?? remembered.food,
        ally: visibleWorld.ally ?? remembered.ally,
        threatCount: visible.threatCount ?? 0,
        allyCount: visible.ally ? visible.allyCount : remembered.allyCount,
        allyCentroid: visible.allyCentroid,
    }),
    deriveSprint: (mode, threatState, hungerTier, ctx) => deriveFleeSprintIntent(mode, threatState, hungerTier, ctx.foodFraction),
    scoreDetails: scoreFleeIntentCandidateDetails,
};
export function buildFleeDecisionContext(input) {
    return buildAgentDecisionContext(fleeDecisionSpec, input);
}
