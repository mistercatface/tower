import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { EntityRegistry } from "../GameState/EntityRegistry.js";
import { KineticSession } from "../GameState/KineticSession.js";
import { SandboxWorldState } from "../GameState/SandboxWorldState.js";
import { WorldObstacleGrid } from "../Libraries/Spatial/grid/WorldObstacleGrid.js";
import { createDefaultMapGenBoundsConfig } from "../Libraries/Sandbox/mapGenBounds.js";
import { resetKineticConstraintIds } from "../Libraries/Motion/kineticConstraints.js";
import { getOrderedChainMemberIds } from "../Libraries/Sandbox/chainLinks.js";
import { spawnLinkedBallChain } from "../Libraries/Sandbox/spawnLinkedBallChain.js";
import { applySnakeGameConfig, getSnakeGameConfig, resolveSnakeSegmentSpacing } from "../Libraries/Game/snake/snakeGameConfig.js";
import { getSnakeChainRadius } from "../Libraries/Game/snake/agentMetabolism.js";
import { createAgentMetabolism, feedAgentMetabolism, getAgentHunger, setAgentHunger } from "./harness/agentTestCompat.js";
import { AgentInstance } from "../Libraries/Game/snake/AgentInstance.js";
import { isSnakeFoodTarget } from "../Libraries/Game/snake/snakeFood.js";
import { AGENT_PROFILE } from "../Libraries/AI/agents/AgentProfiles.js";
import { createAgentPopulationRegistry } from "../Libraries/AI/agents/AgentProfiles.js";
import { createSnakeAgentSession } from "../Libraries/Game/snake/snakeAgentSession.js";
import { SNAKE_GAME_SPECIES } from "../Libraries/Game/snake/species/index.js";
import { createSnakeNavWalkable } from "./harness/snakeGameHarness.js";
import { createWorkerNavigation } from "../Libraries/Navigation/WorkerNavigationFactory.js";
async function createTestState(cols = 32, rows = 32) {
    const grid = new WorldObstacleGrid(16);
    grid.rebuildFixed(0, 0, cols * 16, rows * 16);
    const cavernConfig = createDefaultMapGenBoundsConfig();
    cavernConfig.boundsCol = 0;
    cavernConfig.boundsRow = 0;
    cavernConfig.boundsCols = cols;
    cavernConfig.boundsRows = rows;
    const navigation = await createWorkerNavigation(grid);
    return {
        obstacleGrid: grid,
        entityRegistry: new EntityRegistry(),
        worldProps: [],
        kinetic: new KineticSession(),
        sandbox: new SandboxWorldState(),
        editor: { cavernConfig },
        nav: navigation,
    };
}
function chainOptions(segmentCount) {
    const config = getSnakeGameConfig();
    return {
        segmentCount,
        spacing: resolveSnakeSegmentSpacing(config, config.startRadius),
        segmentRadius: config.startRadius,
        linkSlack: config.agentProfiles.snake.linkSlack,
        ballType: config.agentProfiles.snake.bodyPropId,
        headBallType: config.agentProfiles.snake.headPropId,
        growDirX: config.agentProfiles.snake.growDirX,
        growDirY: config.agentProfiles.snake.growDirY,
    };
}
const META = { hungerDrainMs: 30_000, foodValue: 0.5, growthCost: 1.0, starveShedIntervalMs: 10_000 };
function createStarvationTestInstance(state, chain) {
    if (!state.sandbox.snakeGame) {
        const registry = createAgentPopulationRegistry();
        state.sandbox.snakeGame = createSnakeAgentSession({ registry, navWalkable: createSnakeNavWalkable(state), speciesById: SNAKE_GAME_SPECIES });
    }
    return new AgentInstance(state, { profileId: AGENT_PROFILE.snake, head: chain.head, spawnGroupId: chain.spawnGroupId });
}

describe("snake metabolism", () => {
    const profile = { metabolism: META, minAliveSegmentCount: 3 };
    const tickMetab = (state, instance, m, dtMs, drainMultiplier = 1) => {
        instance.metabolism = m;
        return instance.tickMetabolism(state, dtMs, drainMultiplier);
    };

    it("setSnakeHunger clamps and getSnakeHunger reads the bar", () => {
        const m = createAgentMetabolism(profile);
        assert.equal(getAgentHunger(m), 1);
        setAgentHunger(m, 0.5);
        assert.equal(getAgentHunger(m), 0.5);
        setAgentHunger(m, 2);
        assert.equal(getAgentHunger(m), 1);
        setAgentHunger(m, -1);
        assert.equal(getAgentHunger(m), 0);
    });
    it("eating refills hunger first, then spills overflow into growth", () => {
        applySnakeGameConfig({ agentProfiles: { snake: { metabolism: META } } });
        const m = createAgentMetabolism(profile);
        setAgentHunger(m, 0.2);
        assert.equal(feedAgentMetabolism(m), 0);
        assert.equal(getAgentHunger(m), 0.7);
        setAgentHunger(m, 1);
        assert.equal(feedAgentMetabolism(m), 0);
        assert.equal(feedAgentMetabolism(m), 1);
        assert.equal(getAgentHunger(m), 1);
    });
    it("drains hunger to empty then sheds a segment per starve interval", async () => {
        applySnakeGameConfig({ startRadius: 2, agentProfiles: { snake: { metabolism: META, minAliveSegmentCount: 3 } } });
        resetKineticConstraintIds(1);
        const state = await createTestState();
        const chain = spawnLinkedBallChain(state, { col: 8, row: 8 }, chainOptions(5));
        const headId = chain.head.id;
        const instance = createStarvationTestInstance(state, chain);
        const radiusBefore = getSnakeChainRadius(state, headId);
        const shedTailId = instance.memberIds[instance.memberIds.length - 1];
        const m = createAgentMetabolism(profile);
        setAgentHunger(m, 0);
        assert.ok(tickMetab(state, instance, m, 10_000));
        assert.equal(getOrderedChainMemberIds(state, headId).length, 4);
        assert.equal(getSnakeChainRadius(state, headId), radiusBefore);
        assert.equal(getAgentHunger(m), 0);
        const shedTail = state.entityRegistry.get(shedTailId);
        assert.ok(shedTail);
        assert.ok(isSnakeFoodTarget(shedTail));
        assert.equal(shedTail.snakeFoodValue, META.growthCost);
    });
    it("stays starving across sheds instead of bouncing to satisfied", async () => {
        applySnakeGameConfig({ agentProfiles: { snake: { metabolism: META, minAliveSegmentCount: 3 } } });
        resetKineticConstraintIds(1);
        const state = await createTestState();
        const chain = spawnLinkedBallChain(state, { col: 8, row: 8 }, chainOptions(6));
        const headId = chain.head.id;
        const instance = createStarvationTestInstance(state, chain);
        const m = createAgentMetabolism(profile);
        setAgentHunger(m, 0);
        assert.ok(tickMetab(state, instance, m, 10_000));
        assert.equal(getOrderedChainMemberIds(state, headId).length, 5);
        assert.equal(getAgentHunger(m), 0);
        assert.ok(tickMetab(state, instance, m, 10_000));
        assert.equal(getOrderedChainMemberIds(state, headId).length, 4);
        assert.equal(getAgentHunger(m), 0);
    });
    it("a starved min-length snake reads desperate (hunger 0), not satisfied", async () => {
        applySnakeGameConfig({ agentProfiles: { snake: { metabolism: META, minAliveSegmentCount: 3 } } });
        resetKineticConstraintIds(1);
        const state = await createTestState();
        const chain = spawnLinkedBallChain(state, { col: 8, row: 8 }, chainOptions(3));
        const headId = chain.head.id;
        const instance = createStarvationTestInstance(state, chain);
        const m = createAgentMetabolism(profile);
        setAgentHunger(m, 0);
        assert.equal(tickMetab(state, instance, m, 30_000), false);
        assert.equal(getOrderedChainMemberIds(state, headId).length, 3);
        assert.equal(getAgentHunger(m), 0);
    });
    it("sprinting drains hunger faster and sheds sooner", async () => {
        applySnakeGameConfig({ agentProfiles: { snake: { metabolism: META, minAliveSegmentCount: 3 } } });
        resetKineticConstraintIds(1);
        const state = await createTestState();
        const chain = spawnLinkedBallChain(state, { col: 8, row: 8 }, chainOptions(5));
        const headId = chain.head.id;
        const instance = createStarvationTestInstance(state, chain);
        const m = createAgentMetabolism(profile);
        setAgentHunger(m, 0);
        assert.equal(tickMetab(state, instance, m, 5_000, 1), false);
        assert.equal(getOrderedChainMemberIds(state, headId).length, 5);
        assert.ok(tickMetab(state, instance, m, 5_000, 2.5));
        assert.equal(getOrderedChainMemberIds(state, headId).length, 4);
    });
});
