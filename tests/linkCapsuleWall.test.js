import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createKineticTestTick, attachKineticTestTickFromState, kineticPipelineStubs, mockKineticCircle } from "./harness/kineticTickHarness.js";
import { addDistanceConstraint, resetKineticConstraintIds } from "../Libraries/Motion/kineticConstraints.js";
import { gatherKineticConstraintSlab, resolveGatheredKineticConstraintSlab } from "../Libraries/Motion/kineticConstraintSolver.js";
import { runCollisionPipeline } from "../Libraries/Spatial/collision/collisionPipeline.js";
import { getLinkCapsuleSegmentPenetration, minDistanceSegmentToWall } from "../Libraries/Spatial/geometry/WallGeometry.js";
import { loadPropAssets } from "../Libraries/Props/loadPropAssets.js";
import { EntityRegistry } from "../GameState/EntityRegistry.js";
import { KineticSession } from "../GameState/KineticSession.js";
import { SandboxWorldState } from "../GameState/SandboxWorldState.js";
import { WorldObstacleGrid } from "../Libraries/Spatial/grid/WorldObstacleGrid.js";
import { colRowToIndex } from "../Libraries/Spatial/grid/GridUtils.js";
import { spawnLinkedBallChain } from "../Libraries/Sandbox/spawnLinkedBallChain.js";

loadPropAssets();

const wallCircle = (x, y, radius, vx = 0, vy = 0) => mockKineticCircle(x, y, radius, vx, vy, { needsWallCollision: true });

function mockWallSegment(x, y, size = 16) {
    return { x, y, size, width: size, height: size, angle: 0, isDead: false };
}
function stampBlockedCell(grid, col, row) {
    grid.grid[colRowToIndex(col, row, grid.cols)] = 1;
}
function createNarrowCorridorState() {
    const grid = new WorldObstacleGrid(16);
    grid.rebuildFixed(0, 0, 32 * 16, 16 * 16);
    for (let col = 4; col <= 27; col++) {
        stampBlockedCell(grid, col, 6);
        stampBlockedCell(grid, col, 8);
    }
    return { obstacleGrid: grid, entityRegistry: new EntityRegistry(), worldProps: [], kinetic: new KineticSession(), sandbox: new SandboxWorldState() };
}

describe("link capsule wall projection", () => {
    it("detects link penetration when endpoint circles straddle a rail gap", () => {
        const wall = mockWallSegment(58, 8, 16);
        const ax = 50;
        const ay = 10;
        const bx = 66;
        const by = 14;
        const radius = 4;
        assert.ok(minDistanceSegmentToWall(ax, ay, bx, by, wall) < radius);
        const pen = getLinkCapsuleSegmentPenetration(ax, ay, bx, by, radius, wall);
        assert.ok(pen);
        assert.ok(pen.overlap > 0);
    });
    it("projects a wedged distance link out of a wall segment", () => {
        resetKineticConstraintIds(1);
        const wall = mockWallSegment(58, 4, 16);
        const bodyA = wallCircle(50, 14, 4);
        const bodyB = wallCircle(66, 14, 4);
        const tick = createKineticTestTick([bodyA, bodyB]);
        addDistanceConstraint(tick.world.kinetic, { bodyA, bodyB, restLength: 16 });
        tick.frame.getWallCandidates = () => [wall];
        assert.ok(minDistanceSegmentToWall(bodyA.x, bodyA.y, bodyB.x, bodyB.y, wall) < 4);
        gatherKineticConstraintSlab(tick);
        resolveGatheredKineticConstraintSlab(tick);
        assert.ok(minDistanceSegmentToWall(bodyA.x, bodyA.y, bodyB.x, bodyB.y, wall) >= 4 - 0.05);
    });
    it("gathers wall candidates once per unique body in an island", () => {
        resetKineticConstraintIds(1);
        const bodyA = wallCircle(10, 10, 4, 0, 0);
        const bodyB = wallCircle(26, 10, 4, 0, 0);
        const tick = createKineticTestTick([bodyA, bodyB]);
        addDistanceConstraint(tick.world.kinetic, { bodyA, bodyB, restLength: 16 });
        let wallQueries = 0;
        tick.frame.getWallCandidates = () => {
            wallQueries++;
            return [];
        };
        gatherKineticConstraintSlab(tick);
        resolveGatheredKineticConstraintSlab(tick);
        assert.equal(wallQueries, 2, "one wall gather per unique body in the island");
    });
    it("dedupes wall gathers across a multi-link chain island", () => {
        resetKineticConstraintIds(1);
        const bodyA = wallCircle(10, 10, 4, 0, 0);
        const bodyB = wallCircle(26, 10, 4, 0, 0);
        const bodyC = wallCircle(42, 10, 4, 0, 0);
        const tick = createKineticTestTick([bodyA, bodyB, bodyC]);
        addDistanceConstraint(tick.world.kinetic, { bodyA, bodyB, restLength: 16 });
        addDistanceConstraint(tick.world.kinetic, { bodyA: bodyB, bodyB: bodyC, restLength: 16 });
        let wallQueries = 0;
        tick.frame.getWallCandidates = () => {
            wallQueries++;
            return [];
        };
        gatherKineticConstraintSlab(tick);
        resolveGatheredKineticConstraintSlab(tick);
        assert.equal(wallQueries, 3, "three unique bodies in a two-link chain");
    });
    it("does not disturb a fast-moving link in open space with distant gathered walls", () => {
        resetKineticConstraintIds(1);
        const bodyA = wallCircle(10, 10, 4, 40, 0);
        const bodyB = wallCircle(26, 10, 4, 40, 0);
        const startAx = bodyA.x;
        const startBx = bodyB.x;
        const tick = createKineticTestTick([bodyA, bodyB]);
        addDistanceConstraint(tick.world.kinetic, { bodyA, bodyB, restLength: 16 });
        const decoyWalls = Array.from({ length: 32 }, (_, i) => mockWallSegment(400 + i * 8, 400, 16));
        tick.frame.getWallCandidates = () => decoyWalls;
        gatherKineticConstraintSlab(tick);
        resolveGatheredKineticConstraintSlab(tick);
        assert.equal(bodyA.x, startAx);
        assert.equal(bodyB.x, startBx);
    });
    it("filters island walls per link before narrow phase", () => {
        resetKineticConstraintIds(1);
        const nearWall = mockWallSegment(58, 4, 16);
        const farWall = mockWallSegment(500, 500, 16);
        const bodyA = wallCircle(50, 14, 4, 0, 0);
        const bodyB = wallCircle(66, 14, 4, 0, 0);
        const tick = createKineticTestTick([bodyA, bodyB]);
        addDistanceConstraint(tick.world.kinetic, { bodyA, bodyB, restLength: 16 });
        tick.frame.getWallCandidates = () => [nearWall, farWall];
        assert.ok(minDistanceSegmentToWall(bodyA.x, bodyA.y, bodyB.x, bodyB.y, nearWall) < 4);
        gatherKineticConstraintSlab(tick);
        resolveGatheredKineticConstraintSlab(tick);
        assert.ok(minDistanceSegmentToWall(bodyA.x, bodyA.y, bodyB.x, bodyB.y, nearWall) >= 4 - 0.05);
    });
    it("still projects a nearly-static wedged link", () => {
        resetKineticConstraintIds(1);
        const wall = mockWallSegment(58, 4, 16);
        const bodyA = wallCircle(50, 14, 4, 0, 0);
        const bodyB = wallCircle(66, 14, 4, 0, 0);
        const tick = createKineticTestTick([bodyA, bodyB]);
        addDistanceConstraint(tick.world.kinetic, { bodyA, bodyB, restLength: 16 });
        tick.frame.getWallCandidates = () => [wall];
        gatherKineticConstraintSlab(tick);
        resolveGatheredKineticConstraintSlab(tick);
        assert.ok(minDistanceSegmentToWall(bodyA.x, bodyA.y, bodyB.x, bodyB.y, wall) >= 4 - 0.05);
    });
    it("collision pipeline clears wedged head-neck link in a 1-cell corridor", () => {
        resetKineticConstraintIds(1);
        const state = createNarrowCorridorState();
        const chain = spawnLinkedBallChain(state, { col: 10, row: 7 }, { segmentCount: 2, spacing: 8.4, ballType: "ball", growDirX: 1, growDirY: 0 });
        const head = chain.head;
        const neck = chain.members[1];
        head.x = state.obstacleGrid.gridToWorld(10, 7).x;
        head.y = state.obstacleGrid.gridToWorld(10, 7).y + 3;
        neck.x = head.x + 8.4;
        neck.y = head.y + 4;
        state.worldProps.push(head, neck);
        const tick = attachKineticTestTickFromState(state, [head, neck], 16);
        const radius = Math.max(head.radius, neck.radius);
        const walls = [];
        state.obstacleGrid.resetStaticWallProxyPool();
        state.obstacleGrid.appendStaticWallProxiesNearWorld((head.x + neck.x) * 0.5, (head.y + neck.y) * 0.5, 64, walls);
        let minClear = Infinity;
        for (let i = 0; i < walls.length; i++) minClear = Math.min(minClear, minDistanceSegmentToWall(head.x, head.y, neck.x, neck.y, walls[i]));
        assert.ok(minClear < radius, "fixture should start with link-capsule wall overlap");
        runCollisionPipeline(tick, { ...kineticPipelineStubs, kineticIterations: 4 });
        minClear = Infinity;
        state.obstacleGrid.resetStaticWallProxyPool();
        state.obstacleGrid.appendStaticWallProxiesNearWorld((head.x + neck.x) * 0.5, (head.y + neck.y) * 0.5, 64, walls);
        for (let i = 0; i < walls.length; i++) minClear = Math.min(minClear, minDistanceSegmentToWall(head.x, head.y, neck.x, neck.y, walls[i]));
        assert.ok(minClear >= radius - 0.1, `expected link clearance >= ${radius}, got ${minClear}`);
    });
});
