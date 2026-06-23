import { isAgentEngaged } from "../../AI/agents/agentEngagement.js";
import { buildAgentDecisionContext, buildAgentDecisionFrame, pickAgentIntentPolicy } from "../../AI/agents/buildAgentDecisionContext.js";
import { deriveThreatState } from "../../AI/agents/deriveThreatState.js";
import {
    costPerCellForHunger,
    foodHungerScoreValue,
    netScoreDetail,
    netScoreOnly,
    resetScoreDetailScratch,
    SCORE_ABSENT,
    scoreCandidateSet,
    scoreRiskAdjustedFlee,
} from "../../AI/utility/utilityScoring.js";
import { getSnakeGameConfig } from "./snakeGameConfig.js";
import { deriveSnakeEngagementState } from "./snakeEngagement.js";
const SCORE_ORDER = ["flee", "seek_prey", "seek_food", "seek_ally", "explore"];
const SNAKE_REMEMBERED_SLOTS = [{ key: "threat" }, { key: "prey" }, { key: "food" }, { key: "ally" }, { key: "allyCount", allyCount: 1 }, { key: "allyCentroid", constant: null }];
const SNAKE_EVENT_TARGET_SLOTS = ["threat", "prey", "food", "ally"];
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
function preyValueForHunger(weights, pressure, hungerTier) {
    return effortConfig(pressure).preyValue[hungerTier ?? "hungry"] ?? weights.prey;
}
function scorePreyDetail(ctx, weights, pressure) {
    const prey = ctx.known.prey;
    if (!prey) return SCORE_ABSENT;
    const hungerTier = ctx.hungerTier;
    let value = preyValueForHunger(weights, pressure, hungerTier);
    const isPreySnake = prey.type === "snake_head";
    const seekerFaction = ctx.seekerFaction;
    const isEnemySnake = isPreySnake && seekerFaction && prey.faction && prey.faction !== seekerFaction;
    if (isEnemySnake) value = pressure.enemySnakePreyValue ?? weights.prey + 1000;
    else if (hungerTier === "desperate" && (!ctx.known.food || ctx.routeStatus?.routeFailed)) value += pressure.preyDesperationBonus;
    return netScoreDetail(value, ctx.reachSteps.prey, costPerCellForHunger(pressure, hungerTier));
}
function scoreFoodDetail(ctx, weights, pressure) {
    if (!ctx.known.food) return SCORE_ABSENT;
    const value = foodHungerScoreValue(weights, pressure, ctx.foodFraction);
    return netScoreDetail(value, ctx.reachSteps.food, costPerCellForHunger(pressure, ctx.hungerTier));
}
function regroupSizeFactor(segmentCount, cohesion) {
    const count = segmentCount ?? cohesion.referenceSegmentCount ?? 3;
    const ref = cohesion.referenceSegmentCount ?? 3;
    const max = cohesion.maxSegmentScale ?? 12;
    if (count <= ref) return 1;
    if (count >= max) return 0;
    return 1 - (count - ref) / (max - ref);
}
function scoreSeekAllyDetail(ctx, weights, pressure) {
    const ally = ctx.known.ally;
    if (!ally) return SCORE_ABSENT;
    if (!ctx.allyState?.leadworthy) return SCORE_ABSENT;
    if (ctx.known.threat) return SCORE_ABSENT;
    const hungerTier = ctx.hungerTier;
    if (hungerTier !== "satisfied") return SCORE_ABSENT;
    const cohesion = getSnakeGameConfig().factionCohesion ?? {};
    const sizeFactor = regroupSizeFactor(ctx.seekerSegmentCount, cohesion);
    if (sizeFactor <= 0) return SCORE_ABSENT;
    const allyReach = ctx.reachSteps.ally;
    if (Number.isFinite(allyReach) && allyReach <= (cohesion.idealStopDist ?? 3)) return SCORE_ABSENT;
    let value = (weights.seek_ally ?? weights.explore) + (cohesion.satisfiedBonus ?? 50);
    value *= sizeFactor;
    const allyCount = ctx.known.allyCount ?? 1;
    if (allyCount > 1) value += (allyCount - 1) * (cohesion.packBonus ?? 15) * sizeFactor;
    return netScoreDetail(value, allyReach, costPerCellForHunger(pressure, hungerTier));
}
export function scoreSnakeIntentCandidateDetails(ctx, weights = getSnakeGameConfig().decisionWeights, pressure = getSnakeGameConfig().decisionPressure) {
    resetScoreDetailScratch();
    return {
        flee: netScoreOnly(scoreRiskAdjustedFlee(ctx, weights, pressure)),
        seek_prey: scorePreyDetail(ctx, weights, pressure),
        seek_food: scoreFoodDetail(ctx, weights, pressure),
        seek_ally: scoreSeekAllyDetail(ctx, weights, pressure),
        explore: netScoreDetail(weights.explore, null, 0),
    };
}
export function scoreSnakeIntentCandidates(ctx, weights, pressure) {
    return scoreCandidateSet(scoreSnakeIntentCandidateDetails(ctx, weights, pressure), SCORE_ORDER).candidateScores;
}
const snakeDecisionSpec = {
    scoreOrder: SCORE_ORDER,
    hungerSatisfiedAt: () => getSnakeGameConfig().hunger.satisfiedAtOrAbove,
    hungerDesperateBelow: () => getSnakeGameConfig().hunger.desperateBelow,
    threatConfig: () => getSnakeGameConfig(),
    weights: () => getSnakeGameConfig().decisionWeights,
    pressure: () => getSnakeGameConfig().decisionPressure,
    allySession: (input) => input.session ?? null,
    targetLost: { seek_prey: "prey", seek_food: "food", seek_ally: "ally" },
    rememberedSlots: SNAKE_REMEMBERED_SLOTS,
    eventTargetSlots: SNAKE_EVENT_TARGET_SLOTS,
    buildVisible: (visibleWorld) => ({
        threat: visibleWorld.threat,
        prey: visibleWorld.prey,
        food: visibleWorld.food,
        ally: visibleWorld.ally,
        allyCount: visibleWorld.allyCount ?? 0,
        allyCentroid: visibleWorld.allyCentroid ?? null,
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
    extraFacts: (input) => ({
        safetyState: input.safetyState,
        recentFailures: input.recentFailures ?? [],
        seekerFaction: input.seekerFaction,
        seekerSegmentCount: input.seekerSegmentCount,
        engagementState: null,
    }),
    deriveSprint: (mode, threatState) => deriveSprintIntent(mode, threatState),
    afterPick: (ctx, chosenIntent) => {
        ctx.engagementState = deriveSnakeEngagementState(ctx, chosenIntent);
    },
    scoreDetails: scoreSnakeIntentCandidateDetails,
};
export function buildSnakeDecisionFrame(input) {
    const foodFraction = input.foodFraction ?? null;
    const hungerTier =
        foodFraction == null ? null : foodFraction >= snakeDecisionSpec.hungerSatisfiedAt() ? "satisfied" : foodFraction < snakeDecisionSpec.hungerDesperateBelow() ? "desperate" : "hungry";
    const threatState = deriveThreatState(input.visibleWorld.threat, input.reachSteps?.threat, input.cellSize ?? 16, getSnakeGameConfig());
    return buildAgentDecisionFrame(snakeDecisionSpec, { ...input, foodFraction, hungerTier, threatState });
}
export function pickSnakeIntentPolicy(ctx, scores = scoreSnakeIntentCandidates(ctx)) {
    return pickAgentIntentPolicy(ctx, scores, snakeDecisionSpec);
}
export function buildSnakeDecisionContext(input) {
    return buildAgentDecisionContext(snakeDecisionSpec, input);
}
