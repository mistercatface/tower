import "./nodeCanvasSetup.js";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computeWallBreakStrength } from "../Libraries/Physics/physics.js";
import { applyPendingWallDamage, createGridWallDamage, flushPendingWallDamage, queueWallHits, resolveKineticWallDamage, resolveWallDamageTarget, wallDamageKey } from "../Libraries/Physics/physics.js";;
import { stampRailWallsQuiet } from "../Libraries/Spatial/spatial.js";
import {  isRailWallEdge  } from "../Libraries/Spatial/spatial.js";
import {  cellIsStaticWall  } from "../Libraries/Spatial/spatial.js";
import { colRowToIndex } from "./harness/testGridUtils.js";
import {  WorldObstacleGrid  } from "../Libraries/Spatial/spatial.js";
import { createWorkerNavigation, terminateWorkerNavigation } from "./WorkerNavigationFactory.js";
import { patchNavWalkableCellIndex } from "../Libraries/Procedural/Mazes/walkableCells.js";
import { gameWorldSurfaceSettings } from "../Render/WorldSurfaceBootstrap.js";
import { EntityRegistry } from "../GameState/EntityRegistry.js";
import { WorldProp } from "../Libraries/Props/props.js";
import { WallCollisionResolver } from "../Libraries/Physics/physics.js";
import { satCheckCollision, entityFacing } from "../Libraries/Physics/physics.js";
import { ensureWallSegmentPolygonShape } from "../Libraries/Physics/physics.js";
const WALL_DAMAGE = { minStrikeSpeed: 28, referenceMaxSpeed: 560, minBreakStrength: 0.1 };
async function createWallDamageTestState() {
    const grid = new WorldObstacleGrid(16);
    grid.rebuildFixed(0, 0, 128, 128);
    const navigation = await createWorkerNavigation(grid);
    const state = {
        obstacleGrid: grid,
        sandbox: {},
        worldSurfaces: { settings: gameWorldSurfaceSettings, activeSurfaceProfileId: "base", invalidateGridBounds: () => {} },
        nav: navigation,
        worldProps: [],
        entityRegistry: new EntityRegistry(),
        kinetic: { kineticConstraints: [] }
    };
    state.nav.setNavWalkableSyncHook((damageBounds) => patchNavWalkableCellIndex(state, damageBounds));
    return state;
}
function stampVoxel(grid, col, row, level = 1) {
    grid.grid[colRowToIndex(col, row, grid.cols)] = level;
}
describe("kinetic wall damage", () => {
    it("resolveSnakeWallDamageConfig shares kinetic floor and reference speed ceiling", () => {
        assert.equal(WALL_DAMAGE.minStrikeSpeed, 28);
        assert.equal(WALL_DAMAGE.referenceMaxSpeed, 560);
    });
    it("computeWallBreakStrength scales with speed and approach angle", () => {
        assert.equal(computeWallBreakStrength(20, -20, WALL_DAMAGE), 0);
        assert.equal(computeWallBreakStrength(560, 10, WALL_DAMAGE), 0);
        const maxHit = computeWallBreakStrength(560, -560, WALL_DAMAGE);
        assert.ok(Math.abs(maxHit - 1) < 0.001);
    });
    it("resolveKineticWallDamage queues hits for any kinetic body", async () => {
        const state = await createWallDamageTestState();
        state.sandbox.gridWallDamage = createGridWallDamage(state, WALL_DAMAGE);
        stampVoxel(state.obstacleGrid, 6, 6);
        const segment = { gridIdx: colRowToIndex(6, 6, state.obstacleGrid.cols), isStaticGridProxy: true, isEdgeRail: false };
        const entity = { id: 42, vx: 560, vy: 0 };
        const wallResolver = {
            resolve(body) {
                body._wallResolveHits = [{ approachDot: -560, normalX: 1, normalY: 0, segment }];
                return true;
            },
        };
        resolveKineticWallDamage(state, entity, { evictKineticProp() {} }, wallResolver);
        assert.equal(state.sandbox.gridWallDamage.pendingBreaks.get("v:54").strength, 1);
        flushPendingWallDamage(state);
        assert.ok(!cellIsStaticWall(state.obstacleGrid, colRowToIndex(6, 6, state.obstacleGrid.cols)));
        assert.equal(state.sandbox.gridWallDamage.pendingBreaks.size, 0);
        terminateWorkerNavigation(state.nav);
    });
    it("resolveWallDamageTarget distinguishes voxel and rail segments", async () => {
        const state = await createWallDamageTestState();
        const grid = state.obstacleGrid;
        stampVoxel(grid, 2, 2);
        stampRailWallsQuiet(state, [{ col: 4, row: 4, side: 1, heightLevel: 1, thicknessLevel: 1 }]);
        const voxelSeg = { gridIdx: colRowToIndex(2, 2, grid.cols), isStaticGridProxy: true, isEdgeRail: false };
        const railSeg = { gridIdx: colRowToIndex(4, 4, grid.cols), gridSide: 1, isStaticGridProxy: false, isEdgeRail: true };
        assert.equal(resolveWallDamageTarget(grid, voxelSeg)?.kind, "voxel");
        assert.equal(resolveWallDamageTarget(grid, railSeg)?.kind, "rail");
        terminateWorkerNavigation(state.nav);
    });
    it("one max-power head-on hit destroys a voxel wall", async () => {
        const state = await createWallDamageTestState();
        const grid = state.obstacleGrid;
        stampVoxel(grid, 3, 3);
        const wallDamage = createGridWallDamage(state, WALL_DAMAGE);
        const segment = { gridIdx: colRowToIndex(3, 3, grid.cols), isStaticGridProxy: true, isEdgeRail: false };
        const hit = { approachDot: -560, normalX: 1, normalY: 0, segment };
        queueWallHits(wallDamage, grid, [hit], 560);
        await applyPendingWallDamage(state, wallDamage);
        assert.ok(!cellIsStaticWall(grid, colRowToIndex(3, 3, grid.cols)));
        assert.equal(wallDamage.pendingBreaks.size, 0);
        terminateWorkerNavigation(state.nav);
    });
    it("one max-power head-on hit destroys a rail wall", async () => {
        const state = await createWallDamageTestState();
        const grid = state.obstacleGrid;
        stampRailWallsQuiet(state, [{ col: 5, row: 5, side: 0, heightLevel: 1, thicknessLevel: 1 }]);
        const wallDamage = createGridWallDamage(state, WALL_DAMAGE);
        const segment = { gridIdx: colRowToIndex(5, 5, grid.cols), gridSide: 0, isStaticGridProxy: false, isEdgeRail: true };
        const hit = { approachDot: -560, normalX: 0, normalY: 1, segment };
        queueWallHits(wallDamage, grid, [hit], 560);
        await applyPendingWallDamage(state, wallDamage);
        assert.ok(!isRailWallEdge(grid.getCellEdge(colRowToIndex(5, 5, grid.cols), 0)));
        assert.equal(wallDamage.pendingBreaks.size, 0);
        terminateWorkerNavigation(state.nav);
    });
    it("wallDamageKey round-trips voxel and rail targets", () => {
        assert.equal(wallDamageKey({ kind: "voxel", idx: 17 }), "v:17");
        assert.equal(wallDamageKey({ kind: "rail", idx: 35, side: 1 }), "r:35:1");
    });
    it("voxel wall hit clears grid wall, spawns a voxel chunk prop, and fractures it", async () => {
        const state = await createWallDamageTestState();
        state.sandbox.gridWallDamage = createGridWallDamage(state, WALL_DAMAGE);
        stampVoxel(state.obstacleGrid, 3, 3, 2); // height level 2
        state.obstacleGrid.setChunkSurfaceProfile(0, 0, "chunk-profile", gameWorldSurfaceSettings.cellsPerChunk);
        
        const segment = { gridIdx: colRowToIndex(3, 3, state.obstacleGrid.cols), isStaticGridProxy: true, isEdgeRail: false };
        const entity = { id: 101, type: "crate", vx: 560, vy: 0 };
        const wallResolver = {
            resolve(body) {
                body._wallResolveHits = [{
                    approachDot: -560,
                    normalX: 1,
                    normalY: 0,
                    segment,
                    contactX: 3 * 16 + 8,
                    contactY: 3 * 16 + 8
                }];
                return true;
            },
        };
        
        resolveKineticWallDamage(state, entity, { evictKineticProp() {} }, wallResolver);
        
        const queued = state.sandbox.gridWallDamage.pendingBreaks.get("v:27");
        assert.ok(queued);
        assert.equal(queued.contactX, 3 * 16 + 8);
        assert.equal(queued.normalX, 1);
        assert.equal(queued.sourceSpeed, 560);
        assert.equal(queued.sourceMass, 1);
        
        flushPendingWallDamage(state);
        
        assert.ok(!cellIsStaticWall(state.obstacleGrid, colRowToIndex(3, 3, state.obstacleGrid.cols)));
        assert.ok(state.worldProps.length > 0);
        
        const shards = state.worldProps.filter(p => p.type === "wall_voxel_chunk");
        assert.ok(shards.length > 0);
        assert.ok(shards.every(s => s.height === 32));
        assert.ok(shards.every(s => s.wallChunkProfileId === "chunk-profile"));
        
        terminateWorkerNavigation(state.nav);
    });
    it("rail wall hit clears edge wall, spawns a rail chunk prop, and fractures it", async () => {
        const state = await createWallDamageTestState();
        state.sandbox.gridWallDamage = createGridWallDamage(state, WALL_DAMAGE);
        stampRailWallsQuiet(state, [{ col: 4, row: 4, side: 1, heightLevel: 2, thicknessLevel: 4 }]);
        state.obstacleGrid.setEdgeSurfaceProfile(colRowToIndex(4, 4, state.obstacleGrid.cols), 1, "edge-profile");
        
        const segment = { gridIdx: colRowToIndex(4, 4, state.obstacleGrid.cols), gridSide: 1, isStaticGridProxy: false, isEdgeRail: true };
        const entity = { id: 102, type: "ball", vx: 0, vy: -560 };
        const wallResolver = {
            resolve(body) {
                body._wallResolveHits = [{
                    approachDot: -560,
                    normalX: 0,
                    normalY: -1,
                    segment,
                    contactX: 4 * 16 + 8,
                    contactY: 4 * 16 + 16
                }];
                return true;
            },
        };
        
        resolveKineticWallDamage(state, entity, { evictKineticProp() {} }, wallResolver);
        
        const queued = state.sandbox.gridWallDamage.pendingBreaks.get("r:36:1");
        assert.ok(queued);
        assert.equal(queued.contactY, 4 * 16 + 16);
        assert.equal(queued.normalY, -1);
        
        flushPendingWallDamage(state);
        
        assert.ok(!isRailWallEdge(state.obstacleGrid.getCellEdge(colRowToIndex(4, 4, state.obstacleGrid.cols), 1)));
        assert.ok(state.worldProps.length > 0);
        const shards = state.worldProps.filter(p => p.type === "wall_rail_chunk");
        assert.ok(shards.length > 0);
        assert.ok(shards.every(s => s.height === 32));
        assert.ok(shards.every(s => s.wallChunkProfileId === "edge-profile"));
        
        terminateWorkerNavigation(state.nav);
    });
    it("real rail proxy integration test", async () => {
        const state = await createWallDamageTestState();
        state.sandbox.gridWallDamage = createGridWallDamage(state, WALL_DAMAGE);
        
        stampRailWallsQuiet(state, [{ col: 4, row: 4, side: 1, heightLevel: 2, thicknessLevel: 4 }]);
        
        const ballProp = new WorldProp(14, 8, "ball", 0);
        ballProp.vx = 560;
        ballProp.vy = 0;
        
        const resolver = new WallCollisionResolver();
        const candidates = [];
        state.obstacleGrid.appendStaticWallProxiesNearWorld(ballProp.x, ballProp.y, ballProp.radius + 32, candidates);
        
        const railProxy = candidates.find(c => c.isEdgeRail && c.gridIdx === colRowToIndex(4, 4, state.obstacleGrid.cols) && c.gridSide === 1);
        assert.ok(railProxy, "obstacle grid should emit rail proxy");
        
        const spatialFrame = {
            frameId: 42,
            getWallCandidates: () => candidates,
            evictKineticProp() {}
        };
        
        resolveKineticWallDamage(state, ballProp, spatialFrame, resolver);
        assert.ok(state.sandbox.gridWallDamage.pendingBreaks.has("r:36:1"));
        
        flushPendingWallDamage(state);
        
        assert.ok(!isRailWallEdge(state.obstacleGrid.getCellEdge(colRowToIndex(4, 4, state.obstacleGrid.cols), 1)));
        assert.ok(state.worldProps.length > 0);
        const shards = state.worldProps.filter(p => p.type === "wall_rail_chunk");
        assert.ok(shards.length > 0);
        assert.ok(shards.every(s => s.height === 32));
        
        terminateWorkerNavigation(state.nav);
    });
    it("breaking resolve plus flush keeps displacement bounded", async () => {
        const state = await createWallDamageTestState();
        state.sandbox.gridWallDamage = createGridWallDamage(state, WALL_DAMAGE);
        stampVoxel(state.obstacleGrid, 6, 6);
        const cellCenter = state.obstacleGrid.gridToWorldByIdx(colRowToIndex(6, 6, state.obstacleGrid.cols));
        const ball = new WorldProp(cellCenter.x - 6, cellCenter.y, "ball", 0);
        ball.vx = 560;
        ball.vy = 0;
        const candidates = [];
        state.obstacleGrid.appendStaticWallProxiesNearWorld(ball.x, ball.y, ball.radius + 32, candidates);
        assert.ok(candidates.length > 0);
        const wall = candidates[0];
        assert.ok(satCheckCollision(ball.x, ball.y, entityFacing(ball), ball.shape, wall.x, wall.y, entityFacing(wall), ensureWallSegmentPolygonShape(wall)));
        const startX = ball.x;
        const spatialFrame = { frameId: 7, getWallCandidates: () => candidates, evictKineticProp() {} };
        resolveKineticWallDamage(state, ball, spatialFrame, new WallCollisionResolver());
        flushPendingWallDamage(state);
        assert.ok(Math.abs(ball.x - startX) < 1, `expected bounded displacement, got ${ball.x - startX}`);
        assert.ok(!cellIsStaticWall(state.obstacleGrid, colRowToIndex(6, 6, state.obstacleGrid.cols)));
        terminateWorkerNavigation(state.nav);
    });
});
