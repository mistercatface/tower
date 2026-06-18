import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadPropAssets } from "../Libraries/Props/loadPropAssets.js";
import { EntityRegistry } from "../GameState/EntityRegistry.js";
import { SandboxWorldState } from "../GameState/SandboxWorldState.js";
import { WorldObstacleGrid } from "../Libraries/Spatial/grid/WorldObstacleGrid.js";
import { resetKineticConstraintIds } from "../Libraries/Motion/kineticConstraints.js";
import { getChainMemberIds, isChainSteeringTarget } from "../Libraries/Sandbox/chainLinks.js";
import { GOAL_ORB_PROP_TYPE, SNAKE_CHAIN_EXPORT_TYPE, spawnGoalOrbAtCell, spawnSnakeChain, snakeChainOccupiedCellKeys, tryExportSnakeChainSpawnGroup } from "../Libraries/Sandbox/spawnSnakeChain.js";
import { getSandboxEntityMeta } from "../GameState/sandboxEntityMeta.js";
import { cavernCellKey } from "../Libraries/Sandbox/cavernFloorCells.js";
loadPropAssets();
function createSnakeSpawnTestState(cols = 32, rows = 32) {
    const grid = new WorldObstacleGrid(16);
    grid.rebuildFixed(0, 0, cols * 16, rows * 16);
    return { obstacleGrid: grid, entityRegistry: new EntityRegistry(), worldProps: [], sandbox: new SandboxWorldState() };
}
describe("spawnSnakeChain", () => {
    it("spawns a three-segment chain with one head and two distance links", () => {
        resetKineticConstraintIds(1);
        const state = createSnakeSpawnTestState();
        const meta = getSandboxEntityMeta(state);
        const anchorCell = { col: 10, row: 10 };
        const chain = spawnSnakeChain(state, anchorCell);
        assert.equal(chain.members.length, 3);
        assert.equal(state.sandbox.kineticConstraints.length, 2);
        assert.ok(meta.isChainHead(chain.head.id));
        assert.ok(!meta.isChainHead(chain.tail.id));
        assert.ok(isChainSteeringTarget(state, meta, chain.head.id));
        assert.ok(!isChainSteeringTarget(state, meta, chain.tail.id));
        const members = getChainMemberIds(state, chain.head.id).sort((a, b) => a - b);
        assert.deepEqual(
            members,
            chain.members.map((prop) => prop.id).sort((a, b) => a - b),
        );
        for (let i = 0; i < state.sandbox.kineticConstraints.length; i++) assert.equal(state.sandbox.kineticConstraints[i].restLength, 16);
    });
    it("exports snake spawn groups with segment count and anchor position", () => {
        resetKineticConstraintIds(1);
        const state = createSnakeSpawnTestState();
        const meta = getSandboxEntityMeta(state);
        const chain = spawnSnakeChain(state, { col: 8, row: 8 });
        const exported = tryExportSnakeChainSpawnGroup(chain.members, meta);
        assert.ok(exported);
        assert.equal(exported.type, SNAKE_CHAIN_EXPORT_TYPE);
        assert.equal(exported.segmentCount, 3);
        assert.equal(exported.x, chain.head.x);
        assert.equal(exported.y, chain.head.y);
    });
    it("spawnGoalOrbAtCell creates a non-kinetic goal orb prop", () => {
        const state = createSnakeSpawnTestState();
        const goal = spawnGoalOrbAtCell(state, { col: 12, row: 12 });
        assert.equal(goal.type, GOAL_ORB_PROP_TYPE);
        assert.equal(goal.strategy.isKinetic, false);
        assert.equal(goal.strategy.spatialRole, "trigger");
    });
    it("snakeChainOccupiedCellKeys covers each member cell", () => {
        resetKineticConstraintIds(1);
        const state = createSnakeSpawnTestState();
        const chain = spawnSnakeChain(state, { col: 10, row: 10 });
        const keys = snakeChainOccupiedCellKeys(chain.members, state.obstacleGrid);
        assert.equal(keys.size, 3);
        assert.ok(keys.has(cavernCellKey(10, 10)));
        assert.ok(keys.has(cavernCellKey(9, 10)));
        assert.ok(keys.has(cavernCellKey(8, 10)));
    });
});
