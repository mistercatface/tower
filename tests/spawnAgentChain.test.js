import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { EntityRegistry } from "../GameState/EntityRegistry.js";
import { KineticSession } from "../GameState/KineticSession.js";
import { SandboxWorldState } from "../GameState/SandboxWorldState.js";
import { WorldObstacleGrid } from "../Libraries/Spatial/grid/WorldObstacleGrid.js";
import { getSandboxEntityMeta } from "../GameState/sandboxEntityMeta.js";
import { resetKineticConstraintIds } from "../Libraries/Motion/kineticConstraints.js";
import { applySnakeGameConfig } from "../Libraries/Game/snake/snakeGameConfig.js";
import { AGENT_PROFILE } from "../Libraries/AI/agents/agentProfile.js";
import { spawnFleeAgent, spawnGameAgentChain, spawnSquidChain } from "../Libraries/Game/snake/spawnAgentChain.js";

function createTestState() {
    const grid = new WorldObstacleGrid(16);
    grid.rebuildFixed(0, 0, 32 * 16, 32 * 16);
    return {
        obstacleGrid: grid,
        entityRegistry: new EntityRegistry(),
        worldProps: [],
        kinetic: new KineticSession(),
        sandbox: new SandboxWorldState(),
    };
}

describe("spawnGameAgentChain", () => {
    it("flee spawns one segment with leader as chain head", () => {
        applySnakeGameConfig();
        resetKineticConstraintIds(9001);
        const state = createTestState();
        const meta = getSandboxEntityMeta(state);
        const pack = spawnFleeAgent(state, { col: 8, row: 8 });
        assert.equal(pack.members.length, 1);
        assert.equal(pack.head.id, pack.leader.id);
        assert.equal(meta.isChainHead(pack.head.id), true);
    });

    it("squid spawns brain at leaderIndex 1 as chain head", () => {
        applySnakeGameConfig();
        resetKineticConstraintIds(9002);
        const state = createTestState();
        const meta = getSandboxEntityMeta(state);
        const pack = spawnSquidChain(state, { col: 8, row: 8 }, { faction: "charlie" });
        assert.equal(pack.members.length, 3);
        assert.equal(pack.brainIndex, 1);
        assert.equal(pack.brain.id, pack.members[1].id);
        assert.equal(pack.leader.id, pack.brain.id);
        assert.equal(meta.isChainHead(pack.brain.id), true);
        assert.equal(meta.isChainHead(pack.members[0].id), false);
    });

    it("snake profile uses leader at index 0", () => {
        applySnakeGameConfig({ segmentCount: 3 });
        resetKineticConstraintIds(9003);
        const state = createTestState();
        const meta = getSandboxEntityMeta(state);
        const chain = spawnGameAgentChain(state, { col: 8, row: 8 }, AGENT_PROFILE.snake, { faction: "red" });
        assert.equal(chain.members.length, 3);
        assert.equal(chain.leaderIndex, 0);
        assert.equal(chain.leader.id, chain.members[0].id);
        assert.equal(meta.isChainHead(chain.members[0].id), true);
    });
});
