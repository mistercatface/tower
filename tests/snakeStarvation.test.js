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
import { getSnakeChainRadius, createAgentMetabolism, feedAgentMetabolism, getAgentHunger, setAgentHunger, tickAgentMetabolism, shrinkSnakeChainFromStarvation } from "../Libraries/Game/snake/agentMetabolism.js";
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

describe("snake metabolism", () => {
    const profile = { metabolism: META, minAliveSegmentCount: 3 };
    const tickMetab = (state, headId, m, dtMs, members = null, drainMultiplier = 1) => {
        const resolvedMembers = members || getOrderedChainMemberIds(state, headId);
        return tickAgentMetabolism(m, dtMs, drainMultiplier, () => {
            const minSegments = m.minAliveSegmentCount ?? 3;
            if (resolvedMembers.length <= minSegments) return false;
            const didShrink = shrinkSnakeChainFromStarvation(state, headId, minSegments, resolvedMembers);
            if (didShrink) {
                resolvedMembers.pop();
                return true;
            }
            return false;
        });
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
        const radiusBefore = getSnakeChainRadius(state, headId);
        const m = createAgentMetabolism(profile);
        setAgentHunger(m, 0);
        assert.ok(tickMetab(state, headId, m, 10_000));
        assert.equal(getOrderedChainMemberIds(state, headId).length, 4);
        assert.equal(getSnakeChainRadius(state, headId), radiusBefore);
        assert.equal(getAgentHunger(m), 0);
    });
    it("stays starving across sheds instead of bouncing to satisfied", async () => {
        applySnakeGameConfig({ agentProfiles: { snake: { metabolism: META, minAliveSegmentCount: 3 } } });
        resetKineticConstraintIds(1);
        const state = await createTestState();
        const chain = spawnLinkedBallChain(state, { col: 8, row: 8 }, chainOptions(6));
        const headId = chain.head.id;
        const m = createAgentMetabolism(profile);
        setAgentHunger(m, 0);
        assert.ok(tickMetab(state, headId, m, 10_000));
        assert.equal(getOrderedChainMemberIds(state, headId).length, 5);
        assert.equal(getAgentHunger(m), 0);
        assert.ok(tickMetab(state, headId, m, 10_000));
        assert.equal(getOrderedChainMemberIds(state, headId).length, 4);
        assert.equal(getAgentHunger(m), 0);
    });
    it("a starved min-length snake reads desperate (hunger 0), not satisfied", async () => {
        applySnakeGameConfig({ agentProfiles: { snake: { metabolism: META, minAliveSegmentCount: 3 } } });
        resetKineticConstraintIds(1);
        const state = await createTestState();
        const chain = spawnLinkedBallChain(state, { col: 8, row: 8 }, chainOptions(3));
        const headId = chain.head.id;
        const m = createAgentMetabolism(profile);
        setAgentHunger(m, 0);
        assert.equal(tickMetab(state, headId, m, 30_000), false);
        assert.equal(getOrderedChainMemberIds(state, headId).length, 3);
        assert.equal(getAgentHunger(m), 0);
    });
    it("sprinting drains hunger faster and sheds sooner", async () => {
        applySnakeGameConfig({ agentProfiles: { snake: { metabolism: META, minAliveSegmentCount: 3 } } });
        resetKineticConstraintIds(1);
        const state = await createTestState();
        const chain = spawnLinkedBallChain(state, { col: 8, row: 8 }, chainOptions(5));
        const headId = chain.head.id;
        const m = createAgentMetabolism(profile);
        setAgentHunger(m, 0);
        assert.equal(tickMetab(state, headId, m, 5_000, null, 1), false);
        assert.equal(getOrderedChainMemberIds(state, headId).length, 5);
        assert.ok(tickMetab(state, headId, m, 5_000, null, 2.5));
        assert.equal(getOrderedChainMemberIds(state, headId).length, 4);
    });
});
