import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadPropAssets } from "../Libraries/Props/loadPropAssets.js";
import { resetKineticConstraintIds } from "../Libraries/Motion/kineticConstraints.js";
import { getOrderedChainMemberIds } from "../Libraries/Sandbox/chainLinks.js";
import { applySnakeGameConfig, getSnakeGameConfig } from "../Libraries/Game/snake/snakeGameConfig.js";
import { registerAgentInstance } from "../Libraries/Game/snake/snakeAgentSession.js";
import { spawnFleeAgent } from "../Libraries/Game/snake/fleeAgent/spawnFleeAgent.js";
import { createFleeAgentInstance } from "../Libraries/Game/snake/fleeAgent/FleeAgentInstance.js";
import { setFleeHunger } from "../Libraries/Game/snake/fleeAgent/fleeMetabolism.js";
import { buildFleeDecisionContext } from "../Libraries/Game/snake/fleeAgent/fleeDecisionModel.js";
import { resolveFleeHuntStrikeTarget } from "../Libraries/Game/snake/fleeAgent/fleeHuntTargeting.js";
import { spawnSnakeChain } from "../Libraries/Game/snake/snakeScene.js";
import { attachKineticTestTickFromState } from "./harness/kineticTickHarness.js";
import { gatherKineticContactPairs, kineticContactBuffer, resolveKineticContactPassWithPairs } from "../Libraries/Spatial/collision/kineticContactSolver.js";
import { applyFleeHuntContactDrive } from "../Libraries/Game/snake/snakeCombat.js";
import { kineticDynamicSlab } from "../Libraries/Spatial/collision/kineticBodySlab.js";
import { createSnakeGameHarnessState, wireSnakeTestGame, registerSnakeTestInstance, primeSnakeHeadVision } from "./harness/snakeGameHarness.js";

loadPropAssets();

function mockTarget(id) {
    return { id, x: 0, y: 0, type: "snake_head", isDead: false };
}

describe("flee agent hunt targeting", () => {
    it("resolveFleeHuntStrikeTarget picks nearest body segment, not head", async () => {
        resetKineticConstraintIds(50);
        const { state } = await createSnakeGameHarnessState();
        wireSnakeTestGame(state);
        applySnakeGameConfig({ startRadius: 2 });
        const pack = spawnFleeAgent(state, { col: 10, row: 10 });
        const prey = spawnSnakeChain(state, { col: 14, row: 10 }, { segmentCount: 5, spacing: 12, segmentRadius: 2, linkSlack: 0.1, faction: "snake", exportType: "snake" });
        const members = getOrderedChainMemberIds(state, prey.chain.head.id);
        const head = state.entityRegistry.getLive(members[0]);
        const strikable = [];
        for (let i = 1; i <= members.length - 2; i++) strikable.push(state.entityRegistry.getLive(members[i]));
        pack.head.x = strikable[0].x;
        pack.head.y = strikable[0].y;
        const onBody = resolveFleeHuntStrikeTarget(pack.head, prey.chain.head.id, state);
        assert.ok(onBody);
        assert.notEqual(onBody.id, head.id);
        for (const segment of strikable) {
            pack.head.x = segment.x + 4;
            pack.head.y = segment.y;
            let bestDistSq = Infinity;
            let expectedId = null;
            for (const candidate of strikable) {
                const dx = candidate.x - pack.head.x;
                const dy = candidate.y - pack.head.y;
                const distSq = dx * dx + dy * dy;
                if (distSq < bestDistSq) {
                    bestDistSq = distSq;
                    expectedId = candidate.id;
                }
            }
            const strike = resolveFleeHuntStrikeTarget(pack.head, prey.chain.head.id, state);
            assert.equal(strike.id, expectedId, `from offset near segment ${segment.id}`);
        }
    });

    it("satisfied flee agent hunts visible 3-segment prey instead of exploring", () => {
        applySnakeGameConfig({ fleeAgent: { hunger: { satisfiedAtOrAbove: 0.85 } } });
        const { decisionSnapshot } = buildFleeDecisionContext({
            visibleWorld: {
                threat: null,
                prey: mockTarget("prey_a"),
                preyDist: 8,
                preySegmentCount: 3,
                food: null,
                threatCount: 0,
                aggregateThreatSeverity: 0,
            },
            foodFraction: 0.95,
        });
        assert.equal(decisionSnapshot.chosenIntent.mode, "hunt");
        assert.equal(decisionSnapshot.sprintIntent.want, true);
    });

    it("hunt latch keeps hunt mode after prey leaves vision", async () => {
        resetKineticConstraintIds(51);
        const { state } = await createSnakeGameHarnessState();
        const { snakeGame } = wireSnakeTestGame(state);
        applySnakeGameConfig({ startRadius: 2, fleeAgent: { huntHysteresis: { minTicks: 45 } } });
        const pack = spawnFleeAgent(state, { col: 10, row: 10 });
        const instance = createFleeAgentInstance(state, { headId: pack.head.id, spawnGroupId: pack.spawnGroupId });
        registerAgentInstance(snakeGame, "flee_agent", instance);
        instance.start(state);
        setFleeHunger(instance.metabolism, 0.9);
        const prey = spawnSnakeChain(state, { col: 14, row: 10 }, { segmentCount: 3, spacing: 12, segmentRadius: 2, linkSlack: 0.1, faction: "snake", exportType: "snake" });
        registerSnakeTestInstance(state, snakeGame, { headId: prey.chain.head.id, spawnGroupId: prey.chain.spawnGroupId });
        prey.chain.head.faction = "snake";
        primeSnakeHeadVision(state, pack.head, getSnakeGameConfig().visionCone);
        instance.tick(state, 16);
        assert.equal(instance.intent.getMode(), "hunt");
        prey.chain.head.isDead = true;
        for (const member of prey.chain.members) {
            if (member) member.isDead = true;
        }
        instance.tick(state, 16);
        assert.equal(instance.intent.getMode(), "hunt");
        const snapshot = instance.intent.getDecisionSnapshot();
        assert.ok(snapshot?.events?.includes("HUNT_HELD") || snapshot?.policyLatch?.hunt?.active);
    });

    it("applyFleeHuntContactDrive steers toward body segment on contact", async () => {
        applySnakeGameConfig({ splitImpulseThreshold: 30, minAliveSegmentCount: 3, headMaxSpeed: 120, fleeAgent: { maxSpeed: 120 } });
        resetKineticConstraintIds(52);
        const { state } = await createSnakeGameHarnessState();
        const { snakeGame } = wireSnakeTestGame(state);
        const pack = spawnFleeAgent(state, { col: 10, row: 10 });
        const instance = createFleeAgentInstance(state, { headId: pack.head.id, spawnGroupId: pack.spawnGroupId });
        registerAgentInstance(snakeGame, "flee_agent", instance);
        instance.start(state);
        const prey = spawnSnakeChain(state, { col: 20, row: 10 }, { segmentCount: 5, spacing: 12, segmentRadius: 2, linkSlack: 0.1, faction: "snake", exportType: "snake" });
        registerSnakeTestInstance(state, snakeGame, { headId: prey.chain.head.id, spawnGroupId: prey.chain.spawnGroupId });
        instance.intent = {
            getMode: () => "hunt",
            getTargetId: () => prey.chain.head.id,
        };
        const victimMembers = getOrderedChainMemberIds(state, prey.chain.head.id);
        const struckBody = state.entityRegistry.getLive(victimMembers[2]);
        const fleeHead = pack.head;
        fleeHead.vx = 80;
        fleeHead.vy = 0;
        struckBody.vx = -5;
        struckBody.vy = 0;
        fleeHead.x = struckBody.x - fleeHead.radius - struckBody.radius + 2;
        fleeHead.y = struckBody.y;
        const props = [...prey.chain.members, fleeHead];
        const tick = attachKineticTestTickFromState(state, props, 50);
        const pairs = gatherKineticContactPairs(tick);
        resolveKineticContactPassWithPairs(tick, pairs);
        assert.ok(kineticContactBuffer.count >= 1);
        applyFleeHuntContactDrive(state, tick.frame, kineticContactBuffer, snakeGame);
        const speed = Math.hypot(kineticDynamicSlab.vx[fleeHead._physId], kineticDynamicSlab.vy[fleeHead._physId]);
        assert.ok(speed > 0);
        const strikeTarget = resolveFleeHuntStrikeTarget(fleeHead, prey.chain.head.id, state);
        const dx = strikeTarget.x - fleeHead.x;
        const dy = strikeTarget.y - fleeHead.y;
        const dist = Math.hypot(dx, dy);
        const dot = (kineticDynamicSlab.vx[fleeHead._physId] * dx + kineticDynamicSlab.vy[fleeHead._physId] * dy) / (speed * dist);
        assert.ok(dot > 0.9, `expected velocity toward body segment, dot=${dot}`);
    });
});
