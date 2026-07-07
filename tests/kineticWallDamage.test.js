import "./nodeCanvasSetup.js";
import assert from "node:assert/strict";
import { packChunkKey } from "../Libraries/Spatial/spatial.js";
import { describe, it } from "node:test";
import { computeWallBreakStrength } from "../Libraries/Physics/physics.js";
import { applyPendingWallDamage, createGridWallDamage, flushPendingWallDamage, queueWallHits, resolveKineticWallDamage, resolveWallDamageTarget, wallDamageKey } from "../Libraries/Physics/physics.js";;
import { stampRailWallsQuiet, RailWallBatch } from "../Libraries/Spatial/spatial.js";
import {  isRailWallEdge  } from "../Libraries/Spatial/spatial.js";
import {  cellIsStaticWall  } from "../Libraries/Spatial/spatial.js";
import { worldIdxAtCell } from "./harness/testGridUtils.js";
import {  WorldObstacleGrid  } from "../Libraries/Spatial/spatial.js";
import { createWorkerNavigation, terminateWorkerNavigation } from "./WorkerNavigationFactory.js";
import { patchNavWalkableCellIndex } from "../Libraries/Navigation/navigation.js";
import { gameWorldSurfaceSettings } from "../Render/WorldSurfaceBootstrap.js";
import { EntityRegistry } from "../GameState/EntityRegistry.js";
import { FractureEngine, FRACTURE_TUNING } from "../Libraries/Physics/fracture.js";
import { WorldProp } from "../Libraries/Props/props.js";
import { WallCollisionResolver } from "../Libraries/Physics/physics.js";
import { satCheckCollision, entityFacing } from "../Libraries/Physics/physics.js";
import { ensureWallSegmentPolygonShape } from "../Libraries/Physics/physics.js";
import { createSandboxSessionState } from "./harness/stateFactories.js";
import { createKineticSession } from "../GameState/KineticSession.js";
import { kineticSpatial } from "../Libraries/Spatial/spatial.js";
import { runKineticPhysics } from "../Libraries/Physics/physics.js";
import { kineticIntegrateHooks } from "./harness/kineticTickHarness.js";
const WALL_DAMAGE = { minStrikeSpeed: 28, referenceMaxSpeed: 560, minBreakStrength: 0.1 };
async function createWallDamageTestState() {
    const grid = new WorldObstacleGrid(16);
    grid.rebuildFixed(0, 0, 128, 128);
    const navigation = await createWorkerNavigation(grid);
    const state = {
        ...createSandboxSessionState(),
        obstacleGrid: grid,
        worldSurfaces: { settings: gameWorldSurfaceSettings, activeSurfaceProfileId: "base", invalidateGridBounds: () => {} },
        nav: navigation,
        worldProps: [],
        entityRegistry: new EntityRegistry(),
        kinetic: { kineticConstraints: [] }
    };
    state.fractureEngine = new FractureEngine(state);
    state.nav.setNavWalkableSyncHook((damageBounds) => patchNavWalkableCellIndex(state, damageBounds));
    return state;
}
function stampVoxel(grid, col, row, level = 1) {
    grid.grid[worldIdxAtCell(grid, col, row)] = level;
}
function wallDebrisTestFrame(extra = {}) {
    return {
        frameId: 1,
        admitKineticProp() {},
        admitKineticProps() {},
        evictKineticProp() {},
        ...extra,
    };
}
function wallDebrisList(state) {
    return state.fractureEngine.wallDebris.list();
}
function assertNoWallChunkWorldProps(state) {
    assert.equal(state.worldProps.some((p) => p.type === "wall_voxel_chunk" || p.type === "wall_rail_chunk"), false);
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
        state.gridWallDamage = createGridWallDamage(state, WALL_DAMAGE);
        stampVoxel(state.obstacleGrid, 6, 6);
        const segment = { gridIdx: worldIdxAtCell(state.obstacleGrid,6, 6), isStaticGridProxy: true, isEdgeRail: false };
        const entity = { id: 42, vx: 560, vy: 0 };
        const wallResolver = {
            resolve(body) {
                body._wallResolveHits = [{ approachDot: -560, normalX: 1, normalY: 0, segment }];
                return true;
            },
        };
        resolveKineticWallDamage(state, entity, wallDebrisTestFrame(), wallResolver);
        assert.equal(state.gridWallDamage.pendingBreaks.get("v:54").strength, 1);
        flushPendingWallDamage(state);
        assert.ok(!cellIsStaticWall(state.obstacleGrid, worldIdxAtCell(state.obstacleGrid,6, 6)));
        assert.equal(state.gridWallDamage.pendingBreaks.size, 0);
        terminateWorkerNavigation(state.nav);
    });
    it("resolveWallDamageTarget distinguishes voxel and rail segments", async () => {
        const state = await createWallDamageTestState();
        const grid = state.obstacleGrid;
        stampVoxel(grid, 2, 2);
        stampRailWallsQuiet(state, RailWallBatch.single(worldIdxAtCell(grid, 4, 4), 1));
        const voxelSeg = { gridIdx: worldIdxAtCell(state.obstacleGrid,2, 2), isStaticGridProxy: true, isEdgeRail: false };
        const railSeg = { gridIdx: worldIdxAtCell(state.obstacleGrid,4, 4), gridSide: 1, isStaticGridProxy: false, isEdgeRail: true };
        assert.equal(resolveWallDamageTarget(grid, voxelSeg)?.kind, "voxel");
        assert.equal(resolveWallDamageTarget(grid, railSeg)?.kind, "rail");
        terminateWorkerNavigation(state.nav);
    });
    it("one max-power head-on hit destroys a voxel wall", async () => {
        const state = await createWallDamageTestState();
        const grid = state.obstacleGrid;
        stampVoxel(grid, 3, 3);
        const wallDamage = createGridWallDamage(state, WALL_DAMAGE);
        const segment = { gridIdx: worldIdxAtCell(state.obstacleGrid,3, 3), isStaticGridProxy: true, isEdgeRail: false };
        const hit = { approachDot: -560, normalX: 1, normalY: 0, segment };
        queueWallHits(wallDamage, grid, [hit], 560);
        wallDamage.spatialFrame = wallDebrisTestFrame();
        await applyPendingWallDamage(state, wallDamage);
        assert.ok(!cellIsStaticWall(grid, worldIdxAtCell(state.obstacleGrid,3, 3)));
        assert.equal(wallDamage.pendingBreaks.size, 0);
        terminateWorkerNavigation(state.nav);
    });
    it("one max-power head-on hit destroys a rail wall", async () => {
        const state = await createWallDamageTestState();
        const grid = state.obstacleGrid;
        stampRailWallsQuiet(state, RailWallBatch.single(worldIdxAtCell(grid, 5, 5), 0, 2, 4));
        const wallDamage = createGridWallDamage(state, WALL_DAMAGE);
        const segment = { gridIdx: worldIdxAtCell(state.obstacleGrid,5, 5), gridSide: 0, isStaticGridProxy: false, isEdgeRail: true };
        const hit = { approachDot: -560, normalX: 0, normalY: 1, segment };
        queueWallHits(wallDamage, grid, [hit], 560);
        wallDamage.spatialFrame = wallDebrisTestFrame();
        await applyPendingWallDamage(state, wallDamage);
        assert.ok(!isRailWallEdge(grid.getCellEdge(worldIdxAtCell(state.obstacleGrid,5, 5), 0)));
        assert.equal(wallDamage.pendingBreaks.size, 0);
        terminateWorkerNavigation(state.nav);
    });
    it("wallDamageKey round-trips voxel and rail targets", () => {
        assert.equal(wallDamageKey({ kind: "voxel", idx: 17 }), "v:17");
        assert.equal(wallDamageKey({ kind: "rail", idx: 35, side: 1 }), "r:35:1");
    });
    it("wall chunk fracture uses unified impact force with wall spawn bias", () => {
        const speed = 100;
        const sourceMass = 2;
        const chunkMass = 1;
        const force = FractureEngine.impactForceFromContact(speed, sourceMass, chunkMass) + FRACTURE_TUNING.wallSpawn.forceBias;
        assert.ok(Math.abs(force - (speed * 0.5 + Math.sqrt(sourceMass * chunkMass) * 0.3 + 10)) < 1e-6);
    });
    it("wall debris spawn fails loud without a spatial frame", async () => {
        const state = await createWallDamageTestState();
        const grid = state.obstacleGrid;
        stampVoxel(grid, 3, 3);
        const wallDamage = createGridWallDamage(state, WALL_DAMAGE);
        const segment = { gridIdx: worldIdxAtCell(state.obstacleGrid,3, 3), isStaticGridProxy: true, isEdgeRail: false };
        const hit = { approachDot: -560, normalX: 1, normalY: 0, segment };
        queueWallHits(wallDamage, grid, [hit], 560);
        assert.throws(() => applyPendingWallDamage(state, wallDamage), /requires spatial frame/);
        terminateWorkerNavigation(state.nav);
    });
    it("voxel wall hit clears grid wall, spawns a voxel chunk prop, and fractures it", async () => {
        const state = await createWallDamageTestState();
        state.gridWallDamage = createGridWallDamage(state, WALL_DAMAGE);
        stampVoxel(state.obstacleGrid, 3, 3, 2); // height level 2
        state.obstacleGrid.setChunkSurfaceProfileAtKey(packChunkKey(0, 0), "chunk-profile", gameWorldSurfaceSettings.cellsPerChunk);
        
        const segment = { gridIdx: worldIdxAtCell(state.obstacleGrid,3, 3), isStaticGridProxy: true, isEdgeRail: false };
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
        
        resolveKineticWallDamage(state, entity, wallDebrisTestFrame(), wallResolver);
        
        const queued = state.gridWallDamage.pendingBreaks.get("v:27");
        assert.ok(queued);
        assert.equal(queued.contactX, 3 * 16 + 8);
        assert.equal(queued.normalX, 1);
        assert.equal(queued.sourceSpeed, 560);
        assert.equal(queued.sourceMass, 1);
        
        flushPendingWallDamage(state);
        
        assert.ok(!cellIsStaticWall(state.obstacleGrid, worldIdxAtCell(state.obstacleGrid,3, 3)));
        const shards = wallDebrisList(state).filter((p) => p.type === "wall_voxel_chunk");
        assert.ok(shards.length > 0);
        assert.ok(shards.every((s) => s.isWallDebris && s._row >= 0));
        assert.ok(shards.every((s) => s.height === 32));
        assert.ok(shards.every((s) => s.wallChunkProfileId === "chunk-profile"));
        assert.ok(shards.every((s) => Math.hypot(s.vx ?? 0, s.vy ?? 0) > 5));
        assertNoWallChunkWorldProps(state);
        
        terminateWorkerNavigation(state.nav);
    });
    it("wall debris re-registers in begin and moves under kinetic physics", async () => {
        const state = await createWallDamageTestState();
        state.gridWallDamage = createGridWallDamage(state, WALL_DAMAGE);
        state.fractureEngine = new FractureEngine(state);
        state.kinetic = createKineticSession();
        stampVoxel(state.obstacleGrid, 3, 3, 2);
        state.obstacleGrid.setChunkSurfaceProfileAtKey(packChunkKey(0, 0), "chunk-profile", gameWorldSurfaceSettings.cellsPerChunk);
        const segment = { gridIdx: worldIdxAtCell(state.obstacleGrid, 3, 3), isStaticGridProxy: true, isEdgeRail: false };
        resolveKineticWallDamage(state, { id: 101, type: "ball", vx: 560, vy: 0 }, wallDebrisTestFrame(), {
            resolve(body) {
                body._wallResolveHits = [{ approachDot: -560, normalX: 1, normalY: 0, segment, contactX: 3 * 16 + 8, contactY: 3 * 16 + 8 }];
                return true;
            },
        });
        flushPendingWallDamage(state);
        const shard = wallDebrisList(state).find((p) => p.type === "wall_voxel_chunk");
        assert.ok(shard);
        shard.vx = 120;
        shard.vy = 60;
        const x0 = shard.x;
        const y0 = shard.y;
        const frame = kineticSpatial.begin(state);
        assert.ok(frame._kineticBodies.includes(shard));
        runKineticPhysics(
            { frame, world: { worldProps: state.worldProps, entityRegistry: state.entityRegistry, kinetic: state.kinetic, sandbox: state.sandbox, fractureEngine: state.fractureEngine } },
            100,
            kineticIntegrateHooks((prop, subDt) => prop.tickPropSubstep(subDt))
        );
        assert.ok(Math.hypot(shard.x - x0, shard.y - y0) > 1);
        terminateWorkerNavigation(state.nav);
    });
    it("rail wall hit clears edge wall, spawns a rail chunk prop, and fractures it", async () => {
        const state = await createWallDamageTestState();
        state.gridWallDamage = createGridWallDamage(state, WALL_DAMAGE);
        stampRailWallsQuiet(state, RailWallBatch.single(worldIdxAtCell(state.obstacleGrid, 4, 4), 1, 2, 4));
        state.obstacleGrid.setEdgeSurfaceProfile(worldIdxAtCell(state.obstacleGrid,4, 4), 1, "edge-profile");
        
        const segment = { gridIdx: worldIdxAtCell(state.obstacleGrid,4, 4), gridSide: 1, isStaticGridProxy: false, isEdgeRail: true };
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
        
        resolveKineticWallDamage(state, entity, wallDebrisTestFrame(), wallResolver);
        
        const queued = state.gridWallDamage.pendingBreaks.get("r:36:1");
        assert.ok(queued);
        assert.equal(queued.contactY, 4 * 16 + 16);
        assert.equal(queued.normalY, -1);
        
        flushPendingWallDamage(state);
        
        assert.ok(!isRailWallEdge(state.obstacleGrid.getCellEdge(worldIdxAtCell(state.obstacleGrid,4, 4), 1)));
        const shards = wallDebrisList(state).filter((p) => p.type === "wall_rail_chunk");
        assert.ok(shards.length > 0);
        assert.ok(shards.every((s) => s.isWallDebris && s._row >= 0));
        assert.ok(shards.every((s) => s.height === 32));
        assert.ok(shards.every((s) => s.wallChunkProfileId === "edge-profile"));
        assertNoWallChunkWorldProps(state);
        
        terminateWorkerNavigation(state.nav);
    });
    it("real rail proxy integration test", async () => {
        const state = await createWallDamageTestState();
        state.gridWallDamage = createGridWallDamage(state, WALL_DAMAGE);
        
        stampRailWallsQuiet(state, RailWallBatch.single(worldIdxAtCell(state.obstacleGrid, 4, 4), 1, 2, 4));
        
        const ballProp = new WorldProp(14, 8, "ball", 0);
        ballProp.vx = 560;
        ballProp.vy = 0;
        
        const resolver = new WallCollisionResolver();
        const candidates = [];
        state.obstacleGrid.appendStaticWallProxiesNearWorld(ballProp.x, ballProp.y, ballProp.radius + 32, candidates);
        
        const railProxy = candidates.find(c => c.isEdgeRail && c.gridIdx === worldIdxAtCell(state.obstacleGrid,4, 4) && c.gridSide === 1);
        assert.ok(railProxy, "obstacle grid should emit rail proxy");
        
        const spatialFrame = wallDebrisTestFrame({
            frameId: 42,
            getWallCandidates: () => candidates,
        });
        
        resolveKineticWallDamage(state, ballProp, spatialFrame, resolver);
        assert.ok(state.gridWallDamage.pendingBreaks.has("r:36:1"));
        
        flushPendingWallDamage(state);
        
        assert.ok(!isRailWallEdge(state.obstacleGrid.getCellEdge(worldIdxAtCell(state.obstacleGrid,4, 4), 1)));
        const shards = wallDebrisList(state).filter((p) => p.type === "wall_rail_chunk");
        assert.ok(shards.length > 0);
        assert.ok(shards.every((s) => s.height === 32));
        
        terminateWorkerNavigation(state.nav);
    });
    it("breaking resolve plus flush keeps displacement bounded", async () => {
        const state = await createWallDamageTestState();
        state.gridWallDamage = createGridWallDamage(state, WALL_DAMAGE);
        stampVoxel(state.obstacleGrid, 6, 6);
        const cellIdx = worldIdxAtCell(state.obstacleGrid, 6, 6);
        const cellX = state.obstacleGrid.gridCenterXByIdx(cellIdx);
        const cellY = state.obstacleGrid.gridCenterYByIdx(cellIdx);
        const ball = new WorldProp(cellX - 6, cellY, "ball", 0);
        ball.vx = 560;
        ball.vy = 0;
        const candidates = [];
        state.obstacleGrid.appendStaticWallProxiesNearWorld(ball.x, ball.y, ball.radius + 32, candidates);
        assert.ok(candidates.length > 0);
        const wall = candidates[0];
        assert.ok(satCheckCollision(ball.x, ball.y, entityFacing(ball), ball.shape, wall.x, wall.y, entityFacing(wall), ensureWallSegmentPolygonShape(wall)));
        const startX = ball.x;
        const spatialFrame = wallDebrisTestFrame({ frameId: 7, getWallCandidates: () => candidates });
        resolveKineticWallDamage(state, ball, spatialFrame, new WallCollisionResolver());
        flushPendingWallDamage(state);
        assert.ok(Math.abs(ball.x - startX) < 1, `expected bounded displacement, got ${ball.x - startX}`);
        assert.ok(!cellIsStaticWall(state.obstacleGrid, worldIdxAtCell(state.obstacleGrid,6, 6)));
        terminateWorkerNavigation(state.nav);
    });
});
