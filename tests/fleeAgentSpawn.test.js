import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resetKineticConstraintIds } from "../Libraries/Motion/kineticConstraints.js";
import { getOrderedChainMemberIds } from "../Libraries/Sandbox/chainLinks.js";
import { applySnakeGameConfig, getSnakeGameConfig } from "../Libraries/Game/snake/snakeGameConfig.js";
import { registerAgentInstance } from "../Libraries/Game/snake/snakeAgentSession.js";
import { getCirclePropRadius } from "../Libraries/Props/propScale.js";
import { resolveFleeAgentForwardDir, spawnGameAgentChain } from "../Libraries/Game/snake/spawnAgentChain.js";
import { spawnPopulationInScene } from "../Libraries/Game/snake/spawnPopulationInScene.js";
import { createAgentInstance } from "../Libraries/Game/snake/AgentInstance.js";
import { AGENT_PROFILE } from "../Libraries/AI/agents/agentProfile.js";
import { getAgentIdentity } from "../Libraries/AI/identity/agentIdentity.js";
import { createSnakeGameHarnessState, wireSnakeTestGame, registerSnakeTestInstance, primeSnakeHeadVision } from "./harness/snakeGameHarness.js";
import { spawnSnakeChain } from "../Libraries/Game/snake/snakeScene.js";
import { syncBallAgentFacingAfterPhysics } from "../Libraries/Game/snake/ballAgent.js";
import { attachKineticTestTickFromState } from "./harness/kineticTickHarness.js";
import { gatherKineticContactPairs, kineticContactBuffer, resolveKineticContactPassWithPairs } from "../Libraries/Spatial/collision/kineticContactSolver.js";
import { applyKineticContactSideEffects } from "../Libraries/Spatial/collision/kineticContactSideEffects.js";
import { resolveSnakeCombatFromContacts } from "../Libraries/Game/snake/snakeCombat.js";
function spawnVisibleSnakeThreat(state, snakeGame, { col, row }, segmentCount = 6) {
    const chain = spawnSnakeChain(state, { col, row }, { segmentCount, spacing: 12, segmentRadius: 2, linkSlack: 0.1, faction: "snake", exportType: "snake" });
    registerSnakeTestInstance(state, snakeGame, { headId: chain.chain.head.id, spawnGroupId: chain.chain.spawnGroupId });
    chain.chain.head.faction = "snake";
    return chain;
}
describe("flee agent spawn", () => {
    it("spawns one flee_ball with chain head", async () => {
        resetKineticConstraintIds(1);
        const { state } = await createSnakeGameHarnessState();
        wireSnakeTestGame(state);
        applySnakeGameConfig({ startRadius: 2 });
        const pack = spawnGameAgentChain(state, { col: 10, row: 10 }, "flee_agent");
        assert.equal(pack.members.length, 1);
        assert.equal(pack.head.type, "boid_triangle");
        assert.equal(pack.head.shape.type, "Circle");
        assert.ok(pack.head.strategy?.canChain);
        assert.deepEqual(getOrderedChainMemberIds(state, pack.head.id), [pack.head.id]);
        assert.equal(state.kinetic.kineticConstraints.length, 0);
    });
    it("initializes facing to flee forward", async () => {
        resetKineticConstraintIds(5);
        const { state } = await createSnakeGameHarnessState();
        wireSnakeTestGame(state);
        applySnakeGameConfig({ startRadius: 2, agentProfiles: { snake: { growDirX: -1, growDirY: 0 } } });
        const forward = resolveFleeAgentForwardDir();
        const pack = spawnGameAgentChain(state, { col: 10, row: 10 }, "flee_agent");
        assert.ok(Math.abs(pack.head.facing - Math.atan2(forward.y, forward.x)) < 1e-4);
    });
    it("smoothly rotates facing toward movement", async () => {
        resetKineticConstraintIds(6);
        const { state } = await createSnakeGameHarnessState();
        const { snakeGame } = wireSnakeTestGame(state);
        applySnakeGameConfig({ startRadius: 2 });
        const pack = spawnGameAgentChain(state, { col: 10, row: 10 }, "flee_agent");
        const instance = createAgentInstance(state, { profileId: AGENT_PROFILE.flee, head: pack.head, spawnGroupId: pack.spawnGroupId });
        registerAgentInstance(snakeGame, "flee_agent", instance);
        instance.start(state);
        pack.head.facing = -Math.PI / 2;
        instance.tick(state, 100);
        pack.head.vx = 100;
        pack.head.vy = 0;
        syncBallAgentFacingAfterPhysics(instance, 100);
        assert.ok(pack.head.facing > -Math.PI / 2, "Should rotate facing toward movement");
        assert.ok(pack.head.facing < 0, "Should rotate smoothly without snapping instantly");
    });
    it("applies fleeAgent roll speed from snake config", async () => {
        resetKineticConstraintIds(9);
        const { state } = await createSnakeGameHarnessState();
        wireSnakeTestGame(state);
        applySnakeGameConfig({ startRadius: 2, agentProfiles: { flee_agent: { gameplay: { leader: { maxSpeed: 120, accel: 400 } } } } });
        const pack = spawnGameAgentChain(state, { col: 10, row: 10 }, "flee_agent");
        assert.equal(pack.head.strategy.groundNav.maxSpeed, 120);
        assert.equal(pack.head.strategy.groundNav.accel, 400);
        assert.equal(pack.head.type, "boid_triangle");
    });
    it("batch spawns flee agents split across configured teams and colors", async () => {
        resetKineticConstraintIds(10);
        const { state } = await createSnakeGameHarnessState();
        const { snakeGame } = wireSnakeTestGame(state);
        applySnakeGameConfig({
            boidCount: 4,
            agentProfiles: {
                flee_agent: {
                    teams: [
                        { faction: "charlie", color: "#f1c40f" },
                        { faction: "delta", color: "#2ecc71" },
                    ],
                },
            },
        });
        const agents = spawnPopulationInScene(state, snakeGame.navWalkable, "flee_agent", { rng: () => 0.5 });
        assert.equal(agents.length, 4);
        assert.deepEqual(
            agents.map((agent) => agent.pack.head.faction),
            ["charlie", "delta", "charlie", "delta"],
        );
        assert.deepEqual(
            agents.map((agent) => getAgentIdentity(agent.pack.head.id).color),
            ["#f1c40f", "#2ecc71", "#f1c40f", "#2ecc71"],
        );
    });
    it("scales ball radius to snake start radius", async () => {
        resetKineticConstraintIds(2);
        const { state } = await createSnakeGameHarnessState();
        wireSnakeTestGame(state);
        applySnakeGameConfig({ startRadius: 2 });
        const pack = spawnGameAgentChain(state, { col: 10, row: 10 }, "flee_agent");
        assert.equal(getCirclePropRadius(pack.head), 2);
        assert.equal(pack.head.radius, 2);
    });
    it("starts, ticks, and flees from a visible snake threat", async () => {
        resetKineticConstraintIds(3);
        const { state } = await createSnakeGameHarnessState();
        wireSnakeTestGame(state);
        applySnakeGameConfig({ startRadius: 2 });
        const snakeGame = state.sandbox.snakeGame;
        const pack = spawnGameAgentChain(state, { col: 10, row: 10 }, "flee_agent");
        const instance = createAgentInstance(state, { profileId: AGENT_PROFILE.flee, head: pack.head, spawnGroupId: pack.spawnGroupId });
        registerAgentInstance(snakeGame, "flee_agent", instance);
        instance.start(state);
        assert.equal(instance.intent.getMode(), "explore");
        instance.tick(state, 16);
        assert.ok(instance.intent.getDestination());
        spawnVisibleSnakeThreat(state, snakeGame, { col: 10, row: 14 }, 6);
        primeSnakeHeadVision(state, pack.head, getSnakeGameConfig().shared.visionRange);
        instance.tick(state, 16);
        assert.equal(instance.intent.getMode(), "flee");
    });
    it("starts, ticks, and seeks a visible opposing flee team", async () => {
        resetKineticConstraintIds(11);
        const { state } = await createSnakeGameHarnessState();
        wireSnakeTestGame(state);
        applySnakeGameConfig({ startRadius: 2 });
        const snakeGame = state.sandbox.snakeGame;
        const seekerPack = spawnGameAgentChain(state, { col: 10, row: 10 }, "flee_agent", { faction: "charlie" });
        const targetPack = spawnGameAgentChain(state, { col: 12, row: 10 }, "flee_agent", { faction: "delta" });
        const seeker = createAgentInstance(state, { profileId: AGENT_PROFILE.flee, head: seekerPack.head, spawnGroupId: seekerPack.spawnGroupId });
        const target = createAgentInstance(state, { profileId: AGENT_PROFILE.flee, head: targetPack.head, spawnGroupId: targetPack.spawnGroupId });
        registerAgentInstance(snakeGame, "flee_agent", seeker);
        registerAgentInstance(snakeGame, "flee_agent", target);
        seeker.start(state);
        target.start(state);
        primeSnakeHeadVision(state, seekerPack.head, getSnakeGameConfig().shared.visionRange);
        seeker.tick(state, 16);
        assert.equal(seeker.intent.getMode(), "seek_enemy");
        assert.equal(seeker.intent.getTargetId(), targetPack.head.id);
    });
    it("shatters flee agent on predator snake head ram", async () => {
        applySnakeGameConfig({ splitImpulseThreshold: 30 });
        resetKineticConstraintIds(4);
        const { state } = await createSnakeGameHarnessState();
        wireSnakeTestGame(state);
        const snakeGame = state.sandbox.snakeGame;
        const pack = spawnGameAgentChain(state, { col: 10, row: 10 }, "flee_agent");
        const instance = createAgentInstance(state, { profileId: AGENT_PROFILE.flee, head: pack.head, spawnGroupId: pack.spawnGroupId });
        registerAgentInstance(snakeGame, "flee_agent", instance);
        instance.start(state);
        applySnakeGameConfig({ splitImpulseThreshold: 30, agentProfiles: { snake: { growDirX: 1 } } });
        const predator = spawnSnakeChain(state, { col: 12, row: 10 }, { segmentCount: 5, spacing: 12, segmentRadius: 2, linkSlack: 0.1, faction: "snake", exportType: "snake" });
        applySnakeGameConfig({ splitImpulseThreshold: 30, agentProfiles: { snake: { growDirX: -1 } } });
        registerSnakeTestInstance(state, snakeGame, { headId: predator.chain.head.id, spawnGroupId: predator.chain.spawnGroupId });
        predator.chain.head.faction = "snake";
        const predatorHead = predator.chain.head;
        const prey = pack.head;
        predatorHead.vx = -80;
        predatorHead.vy = 0;
        prey.vx = 10;
        prey.vy = 0;
        predatorHead.x = prey.x + prey.radius + predatorHead.radius - 2;
        predatorHead.y = prey.y;
        const props = [...predator.chain.members, prey];
        const tick = attachKineticTestTickFromState(state, props, 50);
        const pairs = gatherKineticContactPairs(tick);
        resolveKineticContactPassWithPairs(tick, pairs);
        applyKineticContactSideEffects(tick, kineticContactBuffer);
        resolveSnakeCombatFromContacts(state, tick.frame, kineticContactBuffer);
        assert.equal(instance.lifecycle, "dead");
        assert.ok(snakeGame.registry.deadHeadIds.has(pack.head.id));
        assert.equal(state.entityRegistry.getLive(pack.head.id), null);
    });
    it("sprinting flee dies to predator snake head ram", async () => {
        applySnakeGameConfig({ splitImpulseThreshold: 30 });
        resetKineticConstraintIds(6);
        const { state } = await createSnakeGameHarnessState();
        wireSnakeTestGame(state);
        const snakeGame = state.sandbox.snakeGame;
        const pack = spawnGameAgentChain(state, { col: 10, row: 10 }, "flee_agent");
        const instance = createAgentInstance(state, { profileId: AGENT_PROFILE.flee, head: pack.head, spawnGroupId: pack.spawnGroupId });
        registerAgentInstance(snakeGame, "flee_agent", instance);
        instance.start(state);
        instance.sprinting = true;
        applySnakeGameConfig({ splitImpulseThreshold: 30, agentProfiles: { snake: { growDirX: 1 } } });
        const predator = spawnSnakeChain(state, { col: 12, row: 10 }, { segmentCount: 5, spacing: 12, segmentRadius: 2, linkSlack: 0.1, faction: "snake", exportType: "snake" });
        applySnakeGameConfig({ splitImpulseThreshold: 30, agentProfiles: { snake: { growDirX: -1 } } });
        registerSnakeTestInstance(state, snakeGame, { headId: predator.chain.head.id, spawnGroupId: predator.chain.spawnGroupId });
        predator.chain.head.faction = "snake";
        const predatorHead = predator.chain.head;
        const prey = pack.head;
        predatorHead.vx = -80;
        predatorHead.vy = 0;
        prey.vx = 10;
        prey.vy = 0;
        predatorHead.x = prey.x + prey.radius + predatorHead.radius - 2;
        predatorHead.y = prey.y;
        const props = [...predator.chain.members, prey];
        const tick = attachKineticTestTickFromState(state, props, 50);
        const pairs = gatherKineticContactPairs(tick);
        resolveKineticContactPassWithPairs(tick, pairs);
        applyKineticContactSideEffects(tick, kineticContactBuffer);
        resolveSnakeCombatFromContacts(state, tick.frame, kineticContactBuffer);
        assert.equal(instance.lifecycle, "dead");
        assert.ok(snakeGame.registry.deadHeadIds.has(pack.head.id));
        assert.equal(state.entityRegistry.getLive(pack.head.id), null);
    });
    it("sprinting flee in flee mode rams snake body and splits the victim", async () => {
        applySnakeGameConfig({ splitImpulseThreshold: 30, agentProfiles: { snake: { minAliveSegmentCount: 3 } } });
        resetKineticConstraintIds(7);
        const { state } = await createSnakeGameHarnessState();
        wireSnakeTestGame(state);
        const snakeGame = state.sandbox.snakeGame;
        const pack = spawnGameAgentChain(state, { col: 10, row: 10 }, "flee_agent");
        const instance = createAgentInstance(state, { profileId: AGENT_PROFILE.flee, head: pack.head, spawnGroupId: pack.spawnGroupId });
        registerAgentInstance(snakeGame, "flee_agent", instance);
        instance.start(state);
        instance.sprinting = true;
        instance.intent = { getMode: () => "flee" };
        const victim = spawnSnakeChain(state, { col: 20, row: 10 }, { segmentCount: 5, spacing: 12, segmentRadius: 2, linkSlack: 0.1, faction: "snake", exportType: "snake" });
        registerSnakeTestInstance(state, snakeGame, { headId: victim.chain.head.id, spawnGroupId: victim.chain.spawnGroupId });
        const victimMembers = getOrderedChainMemberIds(state, victim.chain.head.id);
        const struckBody = state.entityRegistry.getLive(victimMembers[2]);
        const fleeHead = pack.head;
        fleeHead.vx = 80;
        fleeHead.vy = 0;
        struckBody.vx = -5;
        struckBody.vy = 0;
        fleeHead.x = struckBody.x - fleeHead.radius - struckBody.radius + 2;
        fleeHead.y = struckBody.y;
        const props = [...victim.chain.members, fleeHead];
        const tick = attachKineticTestTickFromState(state, props, 50);
        const pairs = gatherKineticContactPairs(tick);
        resolveKineticContactPassWithPairs(tick, pairs);
        applyKineticContactSideEffects(tick, kineticContactBuffer);
        resolveSnakeCombatFromContacts(state, tick.frame, kineticContactBuffer);
        assert.ok(kineticContactBuffer.count >= 1);
        assert.equal(instance.lifecycle, "alive");
        assert.ok(getOrderedChainMemberIds(state, victim.chain.head.id).length < victimMembers.length);
    });
});
