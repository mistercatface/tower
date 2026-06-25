import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resetKineticConstraintIds } from "../Libraries/Motion/kineticConstraints.js";
import { applySnakeGameConfig } from "../Libraries/Game/snake/snakeGameConfig.js";
import { registerAgentInstance } from "../Libraries/Game/snake/snakeAgentSession.js";
import { spawnGameAgentChain } from "../Libraries/Game/snake/spawnAgentChain.js";
import { createAgentInstance } from "../Libraries/Game/snake/AgentInstance.js";
import { AGENT_PROFILE } from "../Libraries/AI/agents/agentProfile.js";
import { setSimpleAgentHunger } from "../Libraries/Game/snake/agentMetabolism.js";
import { buildAgentDecisionContextFor, scoreAgentIntentCandidateDetails, AGENT_DECISION_PROFILE } from "../Libraries/AI/agents/gameDecisionContext.js";
import { deriveSprintIntent } from "../Libraries/AI/agents/deriveSprintIntent.js";
import { spawnSnakeChain } from "../Libraries/Game/snake/snakeScene.js";
import { primeSnakeHeadVision, createSnakeGameHarnessState, wireSnakeTestGame, registerSnakeTestInstance } from "./harness/snakeGameHarness.js";
import { getSnakeGameConfig } from "../Libraries/Game/snake/snakeGameConfig.js";
import { getAgentProfile } from "../Libraries/AI/agents/agentProfile.js";
import { createRangedCombatActionState, resolveRangedWeapon } from "../Libraries/Game/snake/rangedCombat.js";

const CELL = 16;
function sprintCtx(overrides = {}) {
    return { threatState: null, hungerTier: null, foodFraction: null, ...overrides };
}
function fleeReach(overrides = {}) {
    return { threat: null, enemy: null, food: null, ally: null, ...overrides };
}

function mockTarget(id) {
    return { id, x: 0, y: 0, type: "snake_head", isDead: false };
}

describe("flee agent decision model", () => {
    it("deriveSprintIntent blocks flee sprint when hunger is critically low", () => {
        applySnakeGameConfig({ agentProfiles: { flee_agent: { sprint: { fleeSeverity: 0.5, sprintFleeMinHunger: 0.1 }, decisionPressure: { sprintFleeMinHunger: 0.1 } } } });
        const sprint = getAgentProfile(AGENT_DECISION_PROFILE.flee).sprint;
        assert.equal(deriveSprintIntent("flee", sprintCtx({ threatState: { lethal: true, severity: 1 }, hungerTier: "desperate", foodFraction: 0.05 }), sprint).want, false);
    });

    it("deriveSprintIntent sprints on flee when threat is severe enough", () => {
        applySnakeGameConfig({ agentProfiles: { flee_agent: { sprint: { fleeSeverity: 0.5 } } } });
        const sprint = getAgentProfile(AGENT_DECISION_PROFILE.flee).sprint;
        const result = deriveSprintIntent("flee", sprintCtx({ threatState: { lethal: false, severity: 0.6 }, hungerTier: "hungry", foodFraction: 0.6 }), sprint);
        assert.equal(result.want, true);
        assert.equal(result.reason, "escape");
    });

    it("deriveSprintIntent only sprints on seek_food when desperate", () => {
        applySnakeGameConfig({ agentProfiles: { flee_agent: { sprint: { fleeSeverity: 0.4 } } } });
        const sprint = getAgentProfile(AGENT_DECISION_PROFILE.flee).sprint;
        const threat = { lethal: false, severity: 0.5 };
        assert.equal(deriveSprintIntent("seek_food", sprintCtx({ threatState: threat, hungerTier: "hungry", foodFraction: 0.5 }), sprint).want, false);
        assert.equal(deriveSprintIntent("seek_food", sprintCtx({ threatState: threat, hungerTier: "desperate", foodFraction: 0.2 }), sprint).want, true);
    });

    it("explores when only smaller snakes are visible and no food", () => {
        applySnakeGameConfig();
        const ctx = buildAgentDecisionContextFor(AGENT_DECISION_PROFILE.flee, {
            visibleWorld: { threat: null, food: null, ally: null, allyCount: 0, threatCount: 0 },
            foodFraction: 0.55,
        });
        assert.equal(ctx.chosenIntent.mode, "explore");
        assert.equal(ctx.sprintIntent.want, false);
    });

    it("seek_ally beats explore when a visible ally is present and hunger is satisfied", () => {
        applySnakeGameConfig();
        const ally = mockTarget("ally1");
        const ctx = buildAgentDecisionContextFor(AGENT_DECISION_PROFILE.flee, {
            visibleWorld: {
                threat: null,
                food: null,
                ally,
                allyCount: 1,
                allyCentroid: { x: 64, y: 0 },
                threatCount: 0,
            },
            reachSteps: fleeReach({ ally: 4 }),
            foodFraction: 0.9,
        });
        assert.equal(ctx.chosenIntent.mode, "seek_ally");
        assert.equal(ctx.chosenIntent.targetId, "ally1");
        assert.ok(ctx.candidateScores.seek_ally > ctx.candidateScores.explore);
    });

    it("regroups toward a visible ally instead of exploring", async () => {
        resetKineticConstraintIds(42);
        const { state } = await createSnakeGameHarnessState();
        const { snakeGame } = wireSnakeTestGame(state);
        applySnakeGameConfig({ startRadius: 2, agentProfiles: { flee_agent: { sprint: { fleeSeverity: 0.5 } } } });
        const seekerPack = spawnGameAgentChain(state, { col: 10, row: 10 }, "flee_agent", { faction: "bravo" });
        const allyPack = spawnGameAgentChain(state, { col: 14, row: 10 }, "flee_agent", { faction: "bravo" });
        const seeker = createAgentInstance(state, { profileId: AGENT_PROFILE.flee, head: seekerPack.head, spawnGroupId: seekerPack.spawnGroupId });
        registerAgentInstance(snakeGame, "flee_agent", seeker);
        seeker.start(state);
        setSimpleAgentHunger(seeker.metabolism, 0.9);
        seekerPack.head.facing = 0;
        allyPack.head.x = seekerPack.head.x + 64;
        allyPack.head.y = seekerPack.head.y;
        registerAgentInstance(snakeGame, "flee_agent", createAgentInstance(state, { profileId: AGENT_PROFILE.flee, head: allyPack.head, spawnGroupId: allyPack.spawnGroupId }));
        primeSnakeHeadVision(state, seekerPack.head, getSnakeGameConfig().shared.visionRange);
        seeker.tick(state, 16);
        assert.equal(seeker.intent.getMode(), "seek_ally");
        assert.equal(seeker.intent.getTargetId(), allyPack.head.id);
    });

    it("flee beats explore when a visible threat is present", () => {
        applySnakeGameConfig();
        const ctx = buildAgentDecisionContextFor(AGENT_DECISION_PROFILE.flee, {
            visibleWorld: { threat: mockTarget("t1"), food: null, threatCount: 1 },
            reachSteps: fleeReach({ threat: 4 }),
            foodFraction: 0.55,
        });
        assert.equal(ctx.chosenIntent.mode, "flee");
        assert.equal(ctx.sprintIntent.want, true);
    });

    it("flee beats explore when outnumbered by visible threats", () => {
        applySnakeGameConfig({ agentProfiles: { flee_agent: { decisionPressure: { outnumberedFleeBonus: 0.5 } } }, shared: { fleeRange: 128, lethalThreatRange: 48 } });
        const hungerTier = "hungry";
        const threatState = { dist: 64, severity: 0.5, lethal: false };
        const ctx = {
            known: { threat: mockTarget("t1"), food: null, threatCount: 2 },
            remembered: { threat: null, food: null },
            reachSteps: fleeReach({ threat: 4 }),
            committedTarget: null,
            routeStatus: null,
            hungerTier,
            threatState,
            events: [],
        };
        const scores = scoreAgentIntentCandidateDetails(AGENT_DECISION_PROFILE.flee, ctx);
        assert.ok(scores.flee.net > scores.explore.net);
    });

    it("flees from a visible smaller snake instead of exploring", async () => {
        resetKineticConstraintIds(41);
        const { state } = await createSnakeGameHarnessState();
        const { snakeGame } = wireSnakeTestGame(state);
        applySnakeGameConfig({ startRadius: 2, agentProfiles: { flee_agent: { sprint: { fleeSeverity: 0.3 } } } });
        const pack = spawnGameAgentChain(state, { col: 10, row: 10 }, "flee_agent");
        const instance = createAgentInstance(state, { profileId: AGENT_PROFILE.flee, head: pack.head, spawnGroupId: pack.spawnGroupId });
        registerAgentInstance(snakeGame, "flee_agent", instance);
        instance.start(state);
        setSimpleAgentHunger(instance.metabolism, 0.7);
        const threat = spawnSnakeChain(state, { col: 10, row: 12 }, { segmentCount: 3, spacing: 12, segmentRadius: 2, linkSlack: 0.1, faction: "snake", exportType: "snake" });
        registerSnakeTestInstance(state, snakeGame, { headId: threat.chain.head.id, spawnGroupId: threat.chain.spawnGroupId });
        threat.chain.head.faction = "snake";
        primeSnakeHeadVision(state, pack.head, getSnakeGameConfig().shared.visionRange);
        instance.tick(state, 16);
        assert.equal(instance.intent.getMode(), "flee");
        assert.equal(instance.sprinting, true);
    });

    it("flees from a visible larger snake instead of exploring", async () => {
        resetKineticConstraintIds(40);
        const { state } = await createSnakeGameHarnessState();
        const { snakeGame } = wireSnakeTestGame(state);
        applySnakeGameConfig({ startRadius: 2, agentProfiles: { flee_agent: { sprint: { fleeSeverity: 0.3 } } } });
        const pack = spawnGameAgentChain(state, { col: 10, row: 10 }, "flee_agent");
        const instance = createAgentInstance(state, { profileId: AGENT_PROFILE.flee, head: pack.head, spawnGroupId: pack.spawnGroupId });
        registerAgentInstance(snakeGame, "flee_agent", instance);
        instance.start(state);
        setSimpleAgentHunger(instance.metabolism, 0.7);
        const threat = spawnSnakeChain(state, { col: 10, row: 12 }, { segmentCount: 6, spacing: 12, segmentRadius: 2, linkSlack: 0.1, faction: "snake", exportType: "snake" });
        registerSnakeTestInstance(state, snakeGame, { headId: threat.chain.head.id, spawnGroupId: threat.chain.spawnGroupId });
        threat.chain.head.faction = "snake";
        primeSnakeHeadVision(state, pack.head, getSnakeGameConfig().shared.visionRange);
        instance.tick(state, 16);
        assert.equal(instance.intent.getMode(), "flee");
        assert.equal(instance.sprinting, true);
    });

    it("chooses shoot_enemy when a far snake is visible with line of sight", () => {
        applySnakeGameConfig();
        const enemy = mockTarget("snake1");
        enemy.x = 80;
        const ctx = buildAgentDecisionContextFor(AGENT_DECISION_PROFILE.flee, {
            visibleWorld: { threat: null, prey: enemy, food: null, ally: null, allyCount: 0, threatCount: 0 },
            reachSteps: fleeReach({ enemy: 4 }),
            foodFraction: 0.9,
            agent: { x: 0, y: 0 },
            state: { obstacleGrid: { cols: 64, worldCol: () => 0, worldRow: () => 0 }, nav: { observerVisionFrame: { ensureHeadVision: () => ({ cellSet: new Set([0]) }), isVisible: () => true } } },
            actionState: createRangedCombatActionState(),
        });
        assert.equal(ctx.chosenIntent.mode, "shoot_enemy");
        assert.equal(ctx.chosenIntent.targetId, "snake1");
        assert.equal(ctx.combatState.canShoot, true);
    });

    it("derives flee weapon range from vision range minus inset", () => {
        applySnakeGameConfig({ shared: { visionRange: { range: 160 } } });
        const profile = getAgentProfile(AGENT_DECISION_PROFILE.flee);
        const weapon = resolveRangedWeapon(null, profile);
        assert.equal(weapon.maxRange, 144);
        assert.equal(weapon.maxRangeVisionInset, 16);
    });

    it("chooses shoot_enemy when an opposite-faction flee agent is visible with line of sight", () => {
        applySnakeGameConfig();
        const enemy = mockTarget("flee2");
        enemy.x = 80;
        enemy.type = "boid_triangle";
        const ctx = buildAgentDecisionContextFor(AGENT_DECISION_PROFILE.flee, {
            visibleWorld: { threat: null, prey: enemy, food: null, ally: null, allyCount: 0, threatCount: 0 },
            reachSteps: fleeReach({ enemy: 4 }),
            foodFraction: 0.9,
            agent: { x: 0, y: 0 },
            state: { obstacleGrid: { cols: 64, worldCol: () => 0, worldRow: () => 0 }, nav: { observerVisionFrame: { ensureHeadVision: () => ({ cellSet: new Set([0]) }), isVisible: () => true } } },
            actionState: createRangedCombatActionState(),
        });
        assert.equal(ctx.chosenIntent.mode, "shoot_enemy");
        assert.equal(ctx.chosenIntent.targetId, "flee2");
        assert.equal(ctx.combatState.canShoot, true);
    });

    it("backs off instead of chasing when an enemy flee agent is too close", () => {
        applySnakeGameConfig();
        const enemy = mockTarget("flee2");
        enemy.x = 32;
        enemy.type = "boid_triangle";
        const ctx = buildAgentDecisionContextFor(AGENT_DECISION_PROFILE.flee, {
            visibleWorld: { threat: null, prey: enemy, food: null, ally: null, allyCount: 0, threatCount: 0 },
            reachSteps: fleeReach({ enemy: 2 }),
            foodFraction: 0.9,
            agent: { x: 0, y: 0 },
            state: { obstacleGrid: { cols: 64, worldCol: () => 0, worldRow: () => 0 }, nav: { observerVisionFrame: { ensureHeadVision: () => ({ cellSet: new Set([0]) }), isVisible: () => true } } },
            actionState: createRangedCombatActionState(),
        });
        assert.equal(ctx.combatState.shouldBackOffEnemy, true);
        assert.equal(ctx.chosenIntent.mode, "flee");
        assert.equal(ctx.known.threat.id, "flee2");
        assert.equal(ctx.sprintIntent.want, true);
    });

    it("does not run combat LOS or shoot for remembered-only enemies", () => {
        applySnakeGameConfig();
        let losChecks = 0;
        const enemy = mockTarget("flee2");
        enemy.x = 80;
        enemy.type = "boid_triangle";
        const ctx = buildAgentDecisionContextFor(AGENT_DECISION_PROFILE.flee, {
            visibleWorld: { threat: null, prey: null, food: null, ally: null, allyCount: 0, threatCount: 0 },
            memoryWorld: { prey: enemy },
            memorySource: { prey: true },
            reachSteps: fleeReach({ enemy: 4 }),
            foodFraction: 0.9,
            agent: { x: 0, y: 0 },
            state: {
                obstacleGrid: { cols: 64, worldCol: () => 0, worldRow: () => 0 },
                nav: {
                    observerVisionFrame: {
                        ensureHeadVision: () => ({ cellSet: new Set([0]) }),
                        isVisible: () => {
                            losChecks++;
                            return true;
                        },
                    },
                },
            },
            actionState: createRangedCombatActionState(),
        });
        assert.equal(losChecks, 0);
        assert.equal(ctx.combatState.canShoot, false);
        assert.notEqual(ctx.chosenIntent.mode, "shoot_enemy");
    });

    it("opposing flee agents shoot each other at range in integration", async () => {
        resetKineticConstraintIds(100);
        const { state } = await createSnakeGameHarnessState();
        const { snakeGame } = wireSnakeTestGame(state);
        applySnakeGameConfig();
        
        // Spawn charlie (yellow) flee agent
        const charliePack = spawnGameAgentChain(state, { col: 10, row: 10 }, "flee_agent", { faction: "charlie" });
        const charlie = createAgentInstance(state, { profileId: AGENT_PROFILE.flee, head: charliePack.head, spawnGroupId: charliePack.spawnGroupId });
        registerAgentInstance(snakeGame, "flee_agent", charlie);
        charlie.start(state);
        setSimpleAgentHunger(charlie.metabolism, 0.9);
        charliePack.head.facing = 0;

        // Spawn delta (green) flee agent at distance 80px (5 cells)
        const deltaPack = spawnGameAgentChain(state, { col: 15, row: 10 }, "flee_agent", { faction: "delta" });
        const delta = createAgentInstance(state, { profileId: AGENT_PROFILE.flee, head: deltaPack.head, spawnGroupId: deltaPack.spawnGroupId });
        registerAgentInstance(snakeGame, "flee_agent", delta);
        delta.start(state);
        setSimpleAgentHunger(delta.metabolism, 0.9);

        primeSnakeHeadVision(state, charliePack.head, getSnakeGameConfig().shared.visionRange);
        primeSnakeHeadVision(state, deltaPack.head, getSnakeGameConfig().shared.visionRange);

        // Tick once to perceive and select mode
        charlie.tick(state, 16);
        assert.equal(charlie.intent.getMode(), "shoot_enemy");
        assert.equal(charlie.intent.getTargetId(), deltaPack.head.id);
        assert.equal(charlie.combatAction.phase, "reacting");

        // Tick to react
        snakeGame.activeGunBulletIds = [];
        charlie.tick(state, 150);
        assert.equal(snakeGame.activeGunBulletIds.length, 1, "should have fired first bullet after reacting");
        assert.equal(charlie.combatAction.phase, "fire_delay");

        // Tick for second shot
        charlie.tick(state, 150);
        assert.equal(snakeGame.activeGunBulletIds.length, 2, "should have fired second bullet");
        
        // Tick for third shot
        charlie.tick(state, 150);
        assert.equal(snakeGame.activeGunBulletIds.length, 3, "should have fired third bullet");
        assert.equal(charlie.combatAction.phase, "reloading");
    });

    it("opposing flee agents back off when they start inside weapon spacing", async () => {
        resetKineticConstraintIds(101);
        const { state } = await createSnakeGameHarnessState();
        const { snakeGame } = wireSnakeTestGame(state);
        applySnakeGameConfig();

        const charliePack = spawnGameAgentChain(state, { col: 10, row: 10 }, "flee_agent", { faction: "charlie" });
        const charlie = createAgentInstance(state, { profileId: AGENT_PROFILE.flee, head: charliePack.head, spawnGroupId: charliePack.spawnGroupId });
        registerAgentInstance(snakeGame, "flee_agent", charlie);
        charlie.start(state);
        setSimpleAgentHunger(charlie.metabolism, 0.9);

        const deltaPack = spawnGameAgentChain(state, { col: 12, row: 10 }, "flee_agent", { faction: "delta" });
        const delta = createAgentInstance(state, { profileId: AGENT_PROFILE.flee, head: deltaPack.head, spawnGroupId: deltaPack.spawnGroupId });
        registerAgentInstance(snakeGame, "flee_agent", delta);
        delta.start(state);
        setSimpleAgentHunger(delta.metabolism, 0.9);

        primeSnakeHeadVision(state, charliePack.head, getSnakeGameConfig().shared.visionRange);
        primeSnakeHeadVision(state, deltaPack.head, getSnakeGameConfig().shared.visionRange);

        charlie.tick(state, 16);
        assert.equal(charlie.intent.getMode(), "flee");
        assert.equal(charlie.intent.getDecisionContext().combatState.shouldBackOffEnemy, true);
        const dest = charlie.intent.getDestination();
        assert.ok(dest, "flee agent should choose a back-off destination");
        const currentDist = Math.hypot(state.obstacleGrid.worldCol(charliePack.head.x) - state.obstacleGrid.worldCol(deltaPack.head.x), state.obstacleGrid.worldRow(charliePack.head.y) - state.obstacleGrid.worldRow(deltaPack.head.y));
        const destDist = Math.hypot(dest.col - state.obstacleGrid.worldCol(deltaPack.head.x), dest.row - state.obstacleGrid.worldRow(deltaPack.head.y));
        assert.ok(destDist > currentDist, "back-off destination should increase distance from the enemy");
    });
});
