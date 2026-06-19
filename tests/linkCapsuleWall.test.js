import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CircleShape } from "../Libraries/Spatial/collision/Shapes.js";
import { createKineticTestTick, attachKineticTestTickFromState } from "./harness/kineticTickHarness.js";
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

let nextId = 1;
function mockWallSegment(x, y, size = 16) {
    return { x, y, size, width: size, height: size, angle: 0, isDead: false };
}
function mockCircleBody(x, y, radius, vx = 0, vy = 0) {
    return {
        id: nextId++,
        x,
        y,
        radius,
        vx,
        vy,
        angularVelocity: 0,
        isSleeping: false,
        strategy: { isKinetic: true },
        mass: radius,
        get momentOfInertia() {
            return this.mass * this.radius * this.radius * 0.5;
        },
        getShape() {
            return new CircleShape(this.radius);
        },
        needsWallCollision() {
            return true;
        },
    };
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
        const bodyA = mockCircleBody(50, 14, 4);
        const bodyB = mockCircleBody(66, 14, 4);
        const tick = createKineticTestTick([bodyA, bodyB]);
        addDistanceConstraint(tick.world.kinetic, { bodyA, bodyB, restLength: 16 });
        tick.frame.getWallCandidates = () => [wall];
        assert.ok(minDistanceSegmentToWall(bodyA.x, bodyA.y, bodyB.x, bodyB.y, wall) < 4);
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
        runCollisionPipeline(tick, { resolveWalls: () => {}, kineticIterations: 4 });
        minClear = Infinity;
        state.obstacleGrid.resetStaticWallProxyPool();
        state.obstacleGrid.appendStaticWallProxiesNearWorld((head.x + neck.x) * 0.5, (head.y + neck.y) * 0.5, 64, walls);
        for (let i = 0; i < walls.length; i++) minClear = Math.min(minClear, minDistanceSegmentToWall(head.x, head.y, neck.x, neck.y, walls[i]));
        assert.ok(minClear >= radius - 0.1, `expected link clearance >= ${radius}, got ${minClear}`);
    });
});
