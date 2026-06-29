import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { EntityRegistry } from "../GameState/EntityRegistry.js";
import { KineticSession } from "../GameState/KineticSession.js";
import { SandboxWorldState } from "../GameState/SandboxWorldState.js";
import { WorldObstacleGrid } from "../Libraries/Spatial/grid/WorldObstacleGrid.js";
import { resetKineticConstraintIds } from "../Libraries/Motion/kineticConstraints.js";
import { getChainMemberIds, resolveChainLinkRestLength } from "../Libraries/Sandbox/chainLinks.js";
import { spawnLinkedBallChain } from "../Libraries/Sandbox/spawnLinkedBallChain.js";
import { getCirclePropRadius } from "../Libraries/Props/propScale.js";
import { applySnakeGameConfig, getSnakeGameConfig, resolveSnakeSegmentSpacing } from "../Libraries/Game/snake/snakeGameConfig.js";
import { getSnakeChainRadius, growSnakeChainAfterMeal } from "./harness/agentTestCompat.js";

const CHAIN_OPTIONS = {
    segmentCount: 3,
    spacing: 4.2,
    segmentRadius: 2,
    linkSlack: 1.05,
    ballType: "ball",
    headBallType: "snake_head",
    growDirX: 1,
    growDirY: 0,
};

function createSnakeScaleTestState() {
    const grid = new WorldObstacleGrid(16);
    grid.rebuildFixed(0, 0, 256, 256);
    return { obstacleGrid: grid, entityRegistry: new EntityRegistry(), worldProps: [], kinetic: new KineticSession(), sandbox: new SandboxWorldState() };
}

describe("snakeScale", () => {
    it("starts the chain at startRadius with matching link rest lengths", () => {
        applySnakeGameConfig();
        resetKineticConstraintIds(1);
        const state = createSnakeScaleTestState();
        const config = getSnakeGameConfig();
        const chain = spawnLinkedBallChain(state, { col: 10, row: 10 }, {
            ...CHAIN_OPTIONS,
            spacing: resolveSnakeSegmentSpacing(config, config.startRadius),
            segmentRadius: config.startRadius,
            linkSlack: config.agentProfiles.snake.linkSlack,
        });
        assert.equal(getSnakeChainRadius(state, chain.head.id), 2);
        for (let i = 0; i < chain.members.length; i++) assert.equal(getCirclePropRadius(chain.members[i]), 2);
        assert.equal(state.kinetic.kineticConstraints[0].restLength, resolveChainLinkRestLength(chain.members[0], chain.members[1], config.agentProfiles.snake.linkSlack));
    });

    it("keeps chain radius fixed across meals", () => {
        applySnakeGameConfig();
        resetKineticConstraintIds(1);
        const state = createSnakeScaleTestState();
        const config = getSnakeGameConfig();
        const chain = spawnLinkedBallChain(state, { col: 10, row: 10 }, {
            ...CHAIN_OPTIONS,
            spacing: resolveSnakeSegmentSpacing(config, config.startRadius),
            segmentRadius: config.startRadius,
            linkSlack: config.agentProfiles.snake.linkSlack,
        });
        growSnakeChainAfterMeal(state, chain.head.id, getSnakeGameConfig().agentProfiles.snake);
        growSnakeChainAfterMeal(state, chain.head.id, getSnakeGameConfig().agentProfiles.snake);
        const members = getChainMemberIds(state, chain.head.id).map((id) => state.entityRegistry.getLive(id));
        for (let i = 0; i < members.length; i++) assert.equal(getCirclePropRadius(members[i]), config.startRadius);
        assert.equal(state.kinetic.kineticConstraints[0].restLength, resolveChainLinkRestLength(members[0], members[1], config.agentProfiles.snake.linkSlack));
    });

    it("growSnakeChainAfterMeal returns spacing for the current radius", () => {
        applySnakeGameConfig();
        resetKineticConstraintIds(1);
        const state = createSnakeScaleTestState();
        const config = getSnakeGameConfig();
        const chain = spawnLinkedBallChain(state, { col: 8, row: 8 }, {
            ...CHAIN_OPTIONS,
            spacing: resolveSnakeSegmentSpacing(config, config.startRadius),
            segmentRadius: config.startRadius,
            linkSlack: config.agentProfiles.snake.linkSlack,
        });
        const grow = growSnakeChainAfterMeal(state, chain.head.id, getSnakeGameConfig().agentProfiles.snake);
        assert.equal(grow.segmentRadius, config.startRadius);
        assert.equal(grow.spacing, resolveSnakeSegmentSpacing(config, config.startRadius));
        assert.equal(grow.linkSlack, config.agentProfiles.snake.linkSlack);
    });
});
