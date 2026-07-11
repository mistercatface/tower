import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { EntityRegistry } from "../GameState/EntityRegistry.js";
import { FractureEngine } from "../Libraries/Physics/fracture.js";
import { KineticSession } from "../GameState/KineticSession.js";
import { SandboxWorldState } from "../Libraries/Sandbox/sandbox.js";
import {  WorldObstacleGrid  } from "../Libraries/Spatial/spatial.js";
import { getConnectedBodyIds } from "../Libraries/Physics/physics.js";
import { isChainSteeringTarget, growChainSegment, linkedChainOccupiedCellIndices, spawnLinkedBallChain, tryExportLinkedBallChainSpawnGroup } from "../Libraries/Sandbox/sandbox.js";
import { worldIdxAtCell } from "./harness/testGridUtils.js";
import { kineticConstraintStore } from "../Core/engineMemory.js";
const CHAIN_OPTIONS = { segmentCount: 3, spacing: 16, ballType: "ball", growDirX: -1, growDirY: 0, exportType: "test_chain", linkSlack: 1, faction: "alpha" };
function createChainSpawnTestState(cols = 32, rows = 32) {
    const grid = new WorldObstacleGrid(16);
    grid.rebuildFixed(0, 0, cols * 16, rows * 16);
    const world = { obstacleGrid: grid, entityRegistry: new EntityRegistry(), worldProps: [], kinetic: new KineticSession(), sandbox: new SandboxWorldState() };
    world.fractureEngine = new FractureEngine(world);
    return world;
}
describe("spawnLinkedBallChain", () => {
    it("spawns a linked ball chain with one head and distance links", () => {
        const state = createChainSpawnTestState();
        const meta = state.sandbox.entityMeta;
        const anchorIdx = worldIdxAtCell(state.obstacleGrid,10, 10);
        const chain = spawnLinkedBallChain(state, anchorIdx, CHAIN_OPTIONS);
        assert.equal(chain.members.length, 3);
        assert.equal(kineticConstraintStore.count, 2);
        assert.ok(meta.isChainHead(chain.head.id));
        assert.ok(!meta.isChainHead(chain.tail.id));
        assert.ok(isChainSteeringTarget(state, meta, chain.head.id));
        assert.ok(!isChainSteeringTarget(state, meta, chain.tail.id));
        const members = getConnectedBodyIds(state.kinetic, chain.head.id).sort((a, b) => a - b);
        assert.deepEqual(
            members,
            chain.members.map((prop) => prop.id).sort((a, b) => a - b),
        );
        for (let i = 0; i < kineticConstraintStore.count; i++) assert.ok(Math.abs(kineticConstraintStore.restLength[i] - 16) < 1e-6);
    });
    it("exports linked chain spawn groups with segment count and anchor position", () => {
        const state = createChainSpawnTestState();
        const meta = state.sandbox.entityMeta;
        const chain = spawnLinkedBallChain(state, worldIdxAtCell(state.obstacleGrid,8, 8), CHAIN_OPTIONS);
        const exported = tryExportLinkedBallChainSpawnGroup(chain.members);
        assert.ok(exported);
        assert.equal(exported.type, CHAIN_OPTIONS.exportType);
        assert.equal(exported.segmentCount, 3);
        assert.equal(exported.x, chain.head.x);
        assert.equal(exported.y, chain.head.y);
    });
    it("linkedChainOccupiedCellIndices lists unique grid cells occupied by members", () => {
        const state = createChainSpawnTestState();
        const chain = spawnLinkedBallChain(state, worldIdxAtCell(state.obstacleGrid,10, 10), CHAIN_OPTIONS);
        const indices = linkedChainOccupiedCellIndices(chain.members, state.obstacleGrid);
        assert.ok(indices.size >= 2);
        assert.ok(indices.has(worldIdxAtCell(state.obstacleGrid,10, 10)));
        for (let i = 0; i < chain.members.length; i++) {
            const idx = state.obstacleGrid.worldToIdx(chain.members[i].x, chain.members[i].y);
            assert.ok(indices.has(idx));
        }
    });
    it("growChainSegment links a new tail segment at spacing", () => {
        const state = createChainSpawnTestState();
        const chain = spawnLinkedBallChain(state, worldIdxAtCell(state.obstacleGrid,10, 10), CHAIN_OPTIONS);
        const tail = chain.tail;
        const segment = growChainSegment(state, tail, CHAIN_OPTIONS);
        assert.equal(kineticConstraintStore.count, 3);
        assert.equal(segment.x, tail.x - CHAIN_OPTIONS.spacing);
        assert.equal(segment.y, tail.y);
    });
    it("spawnLinkedBallChain uses headBallType for the first segment only", () => {
        const state = createChainSpawnTestState();
        const chain = spawnLinkedBallChain(state, worldIdxAtCell(state.obstacleGrid,10, 10), { ...CHAIN_OPTIONS, headBallType: "cross_pinwheel" });
        assert.equal(chain.head.type, "cross_pinwheel");
        assert.equal(chain.tail.type, CHAIN_OPTIONS.ballType);
    });
    it("spawnLinkedBallChain applies segmentRadius to every member", () => {
        const state = createChainSpawnTestState();
        const chain = spawnLinkedBallChain(state, worldIdxAtCell(state.obstacleGrid,10, 10), { ...CHAIN_OPTIONS, segmentRadius: 2.1, spacing: 4.0, linkSlack: 1.05 });
        assert.equal(chain.head.radius, 2.1);
        assert.equal(chain.tail.radius, 2.1);
        assert.ok(Math.abs(kineticConstraintStore.restLength[0] - 4.2) < 1e-5);
    });
    it("assigns a unique spawn group id per chain", () => {
        const state = createChainSpawnTestState();
        const first = spawnLinkedBallChain(state, worldIdxAtCell(state.obstacleGrid,4, 4), CHAIN_OPTIONS);
        const second = spawnLinkedBallChain(state, worldIdxAtCell(state.obstacleGrid,12, 12), CHAIN_OPTIONS);
        assert.notEqual(first.spawnGroupId, second.spawnGroupId);
    });
});
