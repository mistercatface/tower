import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadPropAssets } from "../Libraries/Props/loadPropAssets.js";
import { EntityRegistry } from "../GameState/EntityRegistry.js";
import { KineticSession } from "../GameState/KineticSession.js";
import { SandboxWorldState } from "../GameState/SandboxWorldState.js";
import { WorldObstacleGrid } from "../Libraries/Spatial/grid/WorldObstacleGrid.js";
import { resetKineticConstraintIds } from "../Libraries/Motion/kineticConstraints.js";
import { getChainMemberIds, isChainSteeringTarget } from "../Libraries/Sandbox/chainLinks.js";
import { growChainSegment, linkedChainOccupiedCellIndices, spawnLinkedBallChain, tryExportLinkedBallChainSpawnGroup } from "../Libraries/Sandbox/spawnLinkedBallChain.js";
import { getSandboxEntityMeta } from "../GameState/sandboxEntityMeta.js";
import { colRowToIndex } from "../Libraries/Spatial/grid/GridUtils.js";
loadPropAssets();
const CHAIN_OPTIONS = { segmentCount: 3, spacing: 16, ballType: "ball", growDirX: -1, growDirY: 0, exportType: "test_chain", linkSlack: 1 };
function createChainSpawnTestState(cols = 32, rows = 32) {
    const grid = new WorldObstacleGrid(16);
    grid.rebuildFixed(0, 0, cols * 16, rows * 16);
    return { obstacleGrid: grid, entityRegistry: new EntityRegistry(), worldProps: [], kinetic: new KineticSession(), sandbox: new SandboxWorldState() };
}
describe("spawnLinkedBallChain", () => {
    it("spawns a linked ball chain with one head and distance links", () => {
        resetKineticConstraintIds(1);
        const state = createChainSpawnTestState();
        const meta = getSandboxEntityMeta(state);
        const anchorCell = { col: 10, row: 10 };
        const chain = spawnLinkedBallChain(state, anchorCell, CHAIN_OPTIONS);
        assert.equal(chain.members.length, 3);
        assert.equal(state.kinetic.kineticConstraints.length, 2);
        assert.ok(meta.isChainHead(chain.head.id));
        assert.ok(!meta.isChainHead(chain.tail.id));
        assert.ok(isChainSteeringTarget(state, meta, chain.head.id));
        assert.ok(!isChainSteeringTarget(state, meta, chain.tail.id));
        const members = getChainMemberIds(state, chain.head.id).sort((a, b) => a - b);
        assert.deepEqual(
            members,
            chain.members.map((prop) => prop.id).sort((a, b) => a - b),
        );
        for (let i = 0; i < state.kinetic.kineticConstraints.length; i++) assert.ok(Math.abs(state.kinetic.kineticConstraints[i].restLength - 8) < 1e-6);
    });
    it("exports linked chain spawn groups with segment count and anchor position", () => {
        resetKineticConstraintIds(1);
        const state = createChainSpawnTestState();
        const meta = getSandboxEntityMeta(state);
        const chain = spawnLinkedBallChain(state, { col: 8, row: 8 }, CHAIN_OPTIONS);
        const exported = tryExportLinkedBallChainSpawnGroup(chain.members, meta);
        assert.ok(exported);
        assert.equal(exported.type, CHAIN_OPTIONS.exportType);
        assert.equal(exported.segmentCount, 3);
        assert.equal(exported.x, chain.head.x);
        assert.equal(exported.y, chain.head.y);
    });
    it("linkedChainOccupiedCellIndices lists unique grid cells occupied by members", () => {
        resetKineticConstraintIds(1);
        const state = createChainSpawnTestState();
        const chain = spawnLinkedBallChain(state, { col: 10, row: 10 }, CHAIN_OPTIONS);
        const indices = linkedChainOccupiedCellIndices(chain.members, state.obstacleGrid);
        assert.ok(indices.size >= 2);
        assert.ok(indices.has(colRowToIndex(10, 10, state.obstacleGrid.cols)));
        for (let i = 0; i < chain.members.length; i++) {
            const { col, row } = state.obstacleGrid.worldToGrid(chain.members[i].x, chain.members[i].y);
            assert.ok(indices.has(colRowToIndex(col, row, state.obstacleGrid.cols)));
        }
    });
    it("growChainSegment links a new tail segment at spacing", () => {
        resetKineticConstraintIds(1);
        const state = createChainSpawnTestState();
        const chain = spawnLinkedBallChain(state, { col: 10, row: 10 }, CHAIN_OPTIONS);
        const tail = chain.tail;
        const segment = growChainSegment(state, tail, CHAIN_OPTIONS);
        assert.equal(state.kinetic.kineticConstraints.length, 3);
        assert.equal(segment.x, tail.x - CHAIN_OPTIONS.spacing);
        assert.equal(segment.y, tail.y);
    });
    it("spawnLinkedBallChain uses headBallType for the first segment only", () => {
        resetKineticConstraintIds(1);
        const state = createChainSpawnTestState();
        const chain = spawnLinkedBallChain(state, { col: 10, row: 10 }, { ...CHAIN_OPTIONS, headBallType: "snake_head" });
        assert.equal(chain.head.type, "snake_head");
        assert.equal(chain.tail.type, CHAIN_OPTIONS.ballType);
    });
    it("spawnLinkedBallChain applies segmentRadius to every member", () => {
        resetKineticConstraintIds(1);
        const state = createChainSpawnTestState();
        const chain = spawnLinkedBallChain(state, { col: 10, row: 10 }, { ...CHAIN_OPTIONS, segmentRadius: 2, spacing: 4.2, linkSlack: 1.05 });
        assert.equal(chain.head.radius, 2);
        assert.equal(chain.tail.radius, 2);
        assert.equal(state.kinetic.kineticConstraints[0].restLength, 4.2);
    });
    it("assigns a unique spawn group id per chain", () => {
        resetKineticConstraintIds(1);
        const state = createChainSpawnTestState();
        const first = spawnLinkedBallChain(state, { col: 4, row: 4 }, CHAIN_OPTIONS);
        const second = spawnLinkedBallChain(state, { col: 12, row: 12 }, CHAIN_OPTIONS);
        assert.notEqual(first.spawnGroupId, second.spawnGroupId);
    });
});
