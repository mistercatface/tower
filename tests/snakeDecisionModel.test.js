import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applySnakeGameConfig, getSnakeGameConfig } from "../Libraries/Game/snake/snakeGameConfig.js";
import { buildSnakeDecisionContext, buildSnakeDecisionFrame, deriveSnakeSprintIntent, pickSnakeIntentPolicy, scoreSnakeIntentCandidates } from "../Libraries/AI/agents/gameDecisionContext.js";
import { deriveThreatState } from "../Libraries/AI/agents/deriveThreatState.js";
import { bandFromThresholds } from "../Libraries/AI/agents/bandFromThresholds.js";
import { createModePolicyLatch } from "../Libraries/AI/agentIntent/policyHysteresis.js";
const TEST_HUNGER_BANDS = [
    { id: "satisfied", min: 0.66 },
    { id: "hungry", min: 0.33 },
    { id: "desperate", min: 0 },
];
const CELL = 16;
function world({ threat = null, prey = null, food = null, ally = null, allyCount = 0, allyCentroid = null } = {}) {
    return { threat, prey, food, ally, allyCount, allyCentroid };
}
function inferReachSteps(visibleWorld, { committedTarget, routeStatus, memoryWorld, memorySource } = {}) {
    const pick = (visibleTarget, mode, kind) => {
        const target = visibleTarget ?? (memorySource?.[kind] ? memoryWorld?.[kind] : null);
        if (!target) return null;
        if (committedTarget?.mode === mode && committedTarget.targetId === target.id && Number.isFinite(routeStatus?.pathLen)) return routeStatus.pathLen;
        return 1;
    };
    return {
        threat: pick(visibleWorld.threat, "flee", "threat"),
        prey: pick(visibleWorld.prey, "seek_prey", "prey"),
        food: pick(visibleWorld.food, "seek_food", "food"),
        ally: pick(visibleWorld.ally, "seek_ally", "ally"),
    };
}
function context(visibleWorld, opts = {}) {
    const { reachSteps, ...rest } = opts;
    return buildSnakeDecisionContext({ visibleWorld, reachSteps: reachSteps ?? inferReachSteps(visibleWorld, opts), cellSize: CELL, ...rest });
}
function snake(id, extra = {}) {
    return { id, x: 0, y: 0, isDead: false, ...extra };
}
function decisionFrame(visibleWorld, opts = {}) {
    const { reachSteps, ...rest } = opts;
    return buildSnakeDecisionFrame({ visibleWorld, reachSteps: reachSteps ?? inferReachSteps(visibleWorld, opts), ...rest });
}
describe("snake hunger facts (PR1)", () => {
    it("derives satisfied/hungry/desperate from food fraction", () => {
        applySnakeGameConfig({ hungerBands: TEST_HUNGER_BANDS });
        const tier = (fraction) => bandFromThresholds(fraction, getSnakeGameConfig().hungerBands);
        assert.equal(tier(1), "satisfied");
        assert.equal(tier(0.66), "satisfied");
        assert.equal(tier(0.5), "hungry");
        assert.equal(tier(0.33), "hungry");
        assert.equal(tier(0.1), "desperate");
    });
    it("returns null hunger tier when no fraction is provided", () => {
        const ctx = context(world({ food: snake(7) }));
        assert.equal(ctx.hungerTier, null);
    });
    it("exposes hunger facts on the decision snapshot", () => {
        applySnakeGameConfig({ hungerBands: TEST_HUNGER_BANDS });
        const ctx = context(world({ food: snake(3) }), { foodFraction: 0.9 });
        assert.equal(ctx.hungerTier, "satisfied");
        assert.equal(ctx.foodFraction, 0.9);
        assert.equal(ctx.chosenIntent.mode, "seek_food");
    });
});
describe("snake intent scoring parity (PR2)", () => {
    it("scored policy prefers shard food over prey while preserving threat and explore ordering", () => {
        applySnakeGameConfig({ decisionWeights: { flee: 400, prey: 300, food: 340, explore: 100 } });
        const cases = [
            { in: world({ threat: snake(1), prey: snake(2), food: snake(3) }), mode: "flee" },
            { in: world({ prey: snake(2), food: snake(3) }), mode: "seek_food" },
            { in: world({ food: snake(3) }), mode: "seek_food" },
            { in: world(), mode: "explore" },
        ];
        for (const c of cases) {
            const frame = decisionFrame(c.in);
            assert.equal(pickSnakeIntentPolicy(frame).mode, c.mode);
        }
    });
    it("stores candidate scores and chosen reason on the snapshot", () => {
        applySnakeGameConfig({ decisionWeights: { flee: 400, prey: 300, food: 340, explore: 100 } });
        const ctx = context(world({ food: snake(9) }));
        assert.deepEqual(ctx.candidateScores, { flee: -Infinity, seek_prey: -Infinity, seek_food: 320, seek_ally: -Infinity, explore: 100 });
        assert.equal(ctx.chosenIntent.mode, "seek_food");
        assert.equal(ctx.chosenReason, null);
    });
    it("absent candidates score -Infinity so explore wins by default", () => {
        const scores = scoreSnakeIntentCandidates(decisionFrame(world()));
        assert.equal(scores.flee, -Infinity);
        assert.equal(scores.seek_prey, -Infinity);
        assert.equal(scores.seek_food, -Infinity);
        assert.equal(scores.seek_ally, -Infinity);
        assert.ok(Number.isFinite(scores.explore));
    });
    it("keeps memory reasons for remembered targets", () => {
        const frame = decisionFrame(world(), { memoryWorld: { prey: snake(5) }, memorySource: { prey: true }, reachSteps: { prey: 5, food: null, ally: null, threat: null } });
        const policy = pickSnakeIntentPolicy(frame);
        assert.equal(policy.mode, "seek_prey");
        assert.equal(policy.reason, "prey_memory");
    });
});
describe("satisfied snakes weigh prey effort", () => {
    it("a satisfied snake grabs adjacent visible prey", () => {
        applySnakeGameConfig({ hungerBands: TEST_HUNGER_BANDS });
        const ctx = context(world({ prey: snake(2) }), { foodFraction: 0.9, reachSteps: { prey: 1, food: null, ally: null, threat: null } });
        assert.equal(ctx.chosenIntent.mode, "seek_prey");
        assert.equal(ctx.candidateScoreDetails.seek_prey.reach, 1);
        assert.equal(ctx.candidateScoreDetails.seek_prey.cost, 25);
    });
    it("a satisfied snake explores instead of chasing far visible prey", () => {
        applySnakeGameConfig({ hungerBands: TEST_HUNGER_BANDS });
        const ctx = context(world({ prey: snake(2, { type: "snake_head", faction: "red" }) }), { foodFraction: 0.9, seekerFaction: "red", reachSteps: { prey: 2, food: null, ally: null, threat: null } });
        assert.equal(ctx.chosenIntent.mode, "explore");
        assert.equal(ctx.candidateScoreDetails.seek_prey.net, 90);
    });
    it("a satisfied snake still attacks an opposite-team snake prey", () => {
        applySnakeGameConfig({ hungerBands: TEST_HUNGER_BANDS });
        const ctx = context(world({ prey: snake(2, { type: "snake_head", faction: "blue" }) }), { foodFraction: 0.9, seekerFaction: "red", reachSteps: { prey: 8, food: null, ally: null, threat: null } });
        assert.equal(ctx.chosenIntent.mode, "seek_prey");
        assert.ok(ctx.candidateScores.seek_prey > 1000);
    });
    it("a hungry snake still chases prey", () => {
        applySnakeGameConfig({ hungerBands: TEST_HUNGER_BANDS });
        const ctx = context(world({ prey: snake(2, { type: "snake_head", faction: "blue" }) }), { foodFraction: 0.4, seekerFaction: "red", reachSteps: { prey: 6, food: null, ally: null, threat: null } });
        assert.equal(ctx.chosenIntent.mode, "seek_prey");
    });
    it("a satisfied snake still flees a larger threat", () => {
        applySnakeGameConfig({ hungerBands: TEST_HUNGER_BANDS });
        const ctx = context(world({ threat: snake(1), prey: snake(2) }), { foodFraction: 1, reachSteps: { threat: 1, prey: 1, food: null, ally: null } });
        assert.equal(ctx.chosenIntent.mode, "flee");
    });
    it("a satisfied snake still seeks food over exploring", () => {
        applySnakeGameConfig({ hungerBands: TEST_HUNGER_BANDS });
        const ctx = context(world({ prey: snake(2), food: snake(3) }), { foodFraction: 0.9 });
        assert.equal(ctx.chosenIntent.mode, "seek_food");
    });
});
describe("committed target effort uses route length", () => {
    it("a satisfied snake abandons a lengthening chase while a desperate snake sustains it", () => {
        applySnakeGameConfig({ hungerBands: TEST_HUNGER_BANDS });
        const prey = snake(2);
        const committedTarget = { mode: "seek_prey", targetId: prey.id };
        const routeStatus = { pathLen: 6 };
        const full = context(world({ prey }), { foodFraction: 0.9, committedTarget, routeStatus, reachSteps: { prey: 6, food: null, ally: null, threat: null } });
        const desperate = context(world({ prey }), { foodFraction: 0.1, committedTarget, routeStatus, reachSteps: { prey: 6, food: null, ally: null, threat: null } });
        assert.equal(full.candidateScoreDetails.seek_prey.reach, 6);
        assert.equal(full.chosenIntent.mode, "explore");
        assert.equal(desperate.chosenIntent.mode, "seek_prey");
    });
    it("surfaces effort fields on the decision snapshot", () => {
        applySnakeGameConfig({ hungerBands: TEST_HUNGER_BANDS });
        const ctx = context(world({ food: snake(3) }), { foodFraction: 0.5, reachSteps: { food: 4, prey: null, ally: null, threat: null } });
        assert.deepEqual(ctx.candidateScoreDetails.seek_food, { value: 490, reach: 4, cost: 80, net: 410 });
        assert.equal(ctx.candidateScores.seek_food, 410);
    });
});
describe("threat severity facts (PR6)", () => {
    it("derives severity from distance and flags lethal range", () => {
        applySnakeGameConfig({ fleeRange: 128, lethalThreatRange: 48 });
        assert.equal(deriveThreatState(null, 10, CELL, getSnakeGameConfig()), null);
        assert.equal(deriveThreatState(snake(1), null, CELL, getSnakeGameConfig()), null);
        assert.equal(deriveThreatState(snake(1), 4, CELL, getSnakeGameConfig()).severity, 0.5);
        assert.equal(deriveThreatState(snake(1), 8, CELL, getSnakeGameConfig()).severity, 0);
        assert.equal(deriveThreatState(snake(1), 2, CELL, getSnakeGameConfig()).lethal, true);
        assert.equal(deriveThreatState(snake(1), 4, CELL, getSnakeGameConfig()).lethal, false);
    });
    it("surfaces threatState on the snapshot without changing the chosen mode", () => {
        applySnakeGameConfig({ fleeRange: 128, lethalThreatRange: 48, decisionWeights: { flee: 400, prey: 300, food: 340, explore: 100 } });
        const ctx = context(world({ threat: snake(1), food: snake(2) }), { reachSteps: { threat: 4, food: 1, prey: null, ally: null } });
        assert.equal(ctx.threatState.severity, 0.5);
        assert.equal(ctx.chosenIntent.mode, "flee");
    });
});
function applyScoringConfig() {
    applySnakeGameConfig({
        hungerBands: [
            { id: "satisfied", min: 0.66 },
            { id: "hungry", min: 0.33 },
            { id: "desperate", min: 0 },
        ],
        decisionWeights: { flee: 400, prey: 300, food: 340, explore: 100 },
        decisionPressure: { foodHungerBonus: 300, preyDesperationBonus: 250 },
    });
}
describe("hunger pressure and route-awareness (PR5)", () => {
    it("raises the food score as the snake gets hungrier", () => {
        applyScoringConfig();
        const full = context(world({ food: snake(1) }), { foodFraction: 1 });
        const empty = context(world({ food: snake(1) }), { foodFraction: 0.1 });
        assert.ok(empty.candidateScores.seek_food > full.candidateScores.seek_food);
    });
    it("a desperate snake hunts prey when no food is known", () => {
        applyScoringConfig();
        const ctx = context(world({ prey: snake(2) }), { foodFraction: 0.1 });
        assert.equal(ctx.chosenIntent.mode, "seek_prey");
    });
    it("a desperate snake hunts prey when its route to food recently failed", () => {
        applyScoringConfig();
        const ctx = context(world({ prey: snake(2), food: snake(3) }), { foodFraction: 0.1, routeStatus: { routeFailed: true } });
        assert.equal(ctx.chosenIntent.mode, "seek_prey");
    });
    it("a desperate snake with reachable food eats instead of hunting", () => {
        applyScoringConfig();
        const ctx = context(world({ prey: snake(2), food: snake(3) }), { foodFraction: 0.1, routeStatus: { routeFailed: false }, reachSteps: { prey: 50, food: 1, ally: null, threat: null } });
        assert.equal(ctx.chosenIntent.mode, "seek_food");
    });
    it("a merely hungry snake prefers reachable shard food over prey", () => {
        applyScoringConfig();
        const ctx = context(world({ prey: snake(2), food: snake(3) }), { foodFraction: 0.5, routeStatus: { routeFailed: false }, reachSteps: { prey: 1, food: 1, ally: null, threat: null } });
        assert.equal(ctx.chosenIntent.mode, "seek_food");
    });
});
function applyRiskConfig() {
    applySnakeGameConfig({
        fleeRange: 128,
        lethalThreatRange: 48,
        hungerBands: [
            { id: "satisfied", min: 0.66 },
            { id: "hungry", min: 0.33 },
            { id: "desperate", min: 0 },
        ],
        decisionWeights: { flee: 400, prey: 300, food: 340, explore: 100 },
        decisionPressure: { foodHungerBonus: 300, preyDesperationBonus: 250, riskTolerance: { satisfied: 0, hungry: 0.4, desperate: 0.75 } },
    });
}
describe("hunger overrides flee for food (PR7)", () => {
    it("a well-fed snake flees a mid-range threat instead of grabbing food", () => {
        applyRiskConfig();
        const ctx = context(world({ threat: snake(1), food: snake(2) }), { foodFraction: 1, reachSteps: { threat: 5, food: 1, prey: null, ally: null } });
        assert.equal(ctx.chosenIntent.mode, "flee");
    });
    it("a hungry snake risks a mid-range threat to reach food", () => {
        applyRiskConfig();
        const ctx = context(world({ threat: snake(1), food: snake(2) }), { foodFraction: 0.5, reachSteps: { threat: 5, food: 1, prey: null, ally: null } });
        assert.equal(ctx.chosenIntent.mode, "seek_food");
    });
    it("a desperate snake risks the threat even harder", () => {
        applyRiskConfig();
        const ctx = context(world({ threat: snake(1), food: snake(2) }), { foodFraction: 0.1, reachSteps: { threat: 5, food: 1, prey: null, ally: null } });
        assert.equal(ctx.chosenIntent.mode, "seek_food");
    });
    it("a lethal-range threat always forces flee, even when desperate", () => {
        applyRiskConfig();
        const ctx = context(world({ threat: snake(1), food: snake(2) }), { foodFraction: 0.1, reachSteps: { threat: 2, food: 1, prey: null, ally: null } });
        assert.equal(ctx.chosenIntent.mode, "flee");
    });
    it("with no hunger info the snake still hard-flees any visible threat", () => {
        applyRiskConfig();
        const ctx = context(world({ threat: snake(1), food: snake(2) }), { reachSteps: { threat: 5, food: 1, prey: null, ally: null } });
        assert.equal(ctx.chosenIntent.mode, "flee");
    });
});
describe("sprint intent facts (PR9)", () => {
    it("sprints to escape a severe or lethal flee threat", () => {
        applySnakeGameConfig({ sprint: { fleeSeverity: 0.5, speedMultiplier: 1.4, accelMultiplier: 1.4, hungerDrainMultiplier: 2.5 } });
        assert.deepEqual(deriveSnakeSprintIntent("flee", { severity: 0.8, lethal: false }), { want: true, reason: "escape" });
        assert.deepEqual(deriveSnakeSprintIntent("flee", { severity: 0.1, lethal: true }), { want: true, reason: "escape" });
    });
    it("does not sprint from a mild flee threat", () => {
        assert.equal(deriveSnakeSprintIntent("flee", { severity: 0.2, lethal: false }).want, false);
    });
    it("sprints to chase prey", () => {
        assert.deepEqual(deriveSnakeSprintIntent("seek_prey", null), { want: true, reason: "chase" });
    });
    it("sprints to grab food under a serious non-lethal threat", () => {
        applySnakeGameConfig({ sprint: { fleeSeverity: 0.5, speedMultiplier: 1.4, accelMultiplier: 1.4, hungerDrainMultiplier: 2.5 } });
        assert.deepEqual(deriveSnakeSprintIntent("seek_food", { severity: 0.8, lethal: false }), { want: true, reason: "feed" });
    });
    it("does not sprint for safe food or exploring", () => {
        assert.equal(deriveSnakeSprintIntent("seek_food", null).want, false);
        assert.equal(deriveSnakeSprintIntent("explore", null).want, false);
    });
    it("surfaces sprintIntent on the decision snapshot", () => {
        applySnakeGameConfig({ hungerBands: TEST_HUNGER_BANDS });
        const ctx = context(world({ prey: snake(9) }), { foodFraction: 0.4 });
        assert.equal(ctx.chosenIntent.mode, "seek_prey");
        assert.deepEqual(ctx.sprintIntent, { want: true, reason: "chase" });
    });
});
describe("snake seek_ally cohesion (4c)", () => {
    function allyWorld(allyId = "ally1", allyReach = 4) {
        return {
            visible: {
                threat: null,
                prey: null,
                food: null,
                ally: snake(allyId, { type: "snake_head", faction: "red" }),
                allyCount: 1,
                allyCentroid: { x: 64, y: 0 },
            },
            reachSteps: { threat: null, prey: null, food: null, ally: allyReach },
        };
    }
    it("seek_ally beats explore when satisfied, safe, and a small snake", () => {
        applySnakeGameConfig();
        const aw = allyWorld();
        const ctx = context(aw.visible, { foodFraction: 0.9, seekerSegmentCount: 3, seekerFaction: "red", reachSteps: aw.reachSteps });
        assert.equal(ctx.chosenIntent.mode, "seek_ally");
        assert.equal(ctx.chosenIntent.targetId, "ally1");
        assert.ok(ctx.candidateScores.seek_ally > ctx.candidateScores.explore);
    });
    it("does not regroup when hungry or desperate", () => {
        applySnakeGameConfig();
        const hungry = context(allyWorld().visible, { foodFraction: 0.5, seekerSegmentCount: 3, reachSteps: allyWorld().reachSteps });
        assert.equal(hungry.chosenIntent.mode, "explore");
        const desperate = context(allyWorld().visible, { foodFraction: 0.1, seekerSegmentCount: 3, reachSteps: allyWorld().reachSteps });
        assert.equal(desperate.chosenIntent.mode, "explore");
    });
    it("scales regroup drive down for long snakes", () => {
        applySnakeGameConfig({ factionCohesion: { referenceSegmentCount: 3, maxSegmentScale: 10 } });
        const small = context(allyWorld().visible, { foodFraction: 0.9, seekerSegmentCount: 3, reachSteps: allyWorld().reachSteps });
        assert.equal(small.chosenIntent.mode, "seek_ally");
        const large = context(allyWorld().visible, { foodFraction: 0.9, seekerSegmentCount: 10, reachSteps: allyWorld().reachSteps });
        assert.equal(large.chosenIntent.mode, "explore");
    });
    it("prefers food over regroup when both are visible", () => {
        applySnakeGameConfig();
        const aw = allyWorld();
        const ctx = context({ ...aw.visible, food: snake(7) }, { foodFraction: 0.9, seekerSegmentCount: 3, reachSteps: { ...aw.reachSteps, food: 1 } });
        assert.equal(ctx.chosenIntent.mode, "seek_food");
    });
    it("does not regroup when already within ideal stop distance", () => {
        applySnakeGameConfig({ factionCohesion: { idealStopDist: 3 } });
        const aw = allyWorld("ally1", 2);
        const ctx = context(aw.visible, { foodFraction: 0.9, seekerSegmentCount: 3, reachSteps: aw.reachSteps });
        assert.equal(ctx.chosenIntent.mode, "explore");
    });
});

describe("policy hysteresis", () => {
    it("holds a latched mode for minimum ticks before releasing", () => {
        const latch = createModePolicyLatch({ mode: "flee", minTicks: 2, holdReason: "flee_hysteresis" });
        assert.deepEqual(latch.apply({ mode: "flee", targetId: null }), { mode: "flee", targetId: null });
        assert.equal(latch.apply({ mode: "seek_food", targetId: 1 }).mode, "flee");
        assert.equal(latch.apply({ mode: "seek_food", targetId: 1 }).mode, "flee");
        assert.equal(latch.apply({ mode: "seek_food", targetId: 1 }).mode, "seek_food");
    });
    it("keeps holding while release conditions fail", () => {
        let safe = false;
        const latch = createModePolicyLatch({ mode: "flee", minTicks: 1, canRelease: () => safe });
        latch.apply({ mode: "flee", targetId: null });
        assert.equal(latch.apply({ mode: "explore", targetId: null }).mode, "flee");
        assert.equal(latch.apply({ mode: "explore", targetId: null }).mode, "flee");
        safe = true;
        assert.equal(latch.apply({ mode: "explore", targetId: null }).mode, "explore");
    });
});
