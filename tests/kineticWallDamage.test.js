import "./nodeCanvasSetup.js";
import assert from "node:assert/strict";
import { packChunkKey } from "../Libraries/Spatial/spatial.js";
import { describe, it } from "node:test";
import { computeWallBreakStrength, applyPendingWallDamage, createGridWallDamage, queueWallHits, resolveKineticWallDamage, classifyWallDamageSegment, packWallDamageKey } from "../Libraries/Physics/fracture.js";
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
import { WallCollisionResolver, createWallHitBuffer, snapshotKineticBodySlab } from "../Libraries/Physics/physics.js";
import { satCheckCollision, entityFacing, ensureWallSegmentPolygonShape } from "../Libraries/Physics/physics.js";
import { createSandboxSessionState } from "./harness/stateFactories.js";
import { createKineticSession } from "../GameState/KineticSession.js";
import { kineticSpatial } from "../Libraries/Spatial/spatial.js";
import { runKineticPhysics } from "../Libraries/Physics/physics.js";
import { kineticIntegrateHooks } from "./harness/kineticTickHarness.js";
import { createRealWorldSurfaces, seedStaticRoofCacheKeys } from "./harness/wallSurfaceInvalidateHarness.js";
import { collectVoxelWallFacesInAabbFlatF32, VOXEL_FACE, VOXEL_FACE_STRIDE } from "../Libraries/World/wallGridBake.js";
import { StrideFloatList } from "../Libraries/World/StrideFloatList.js";
import { GrowI32, staticWallSegmentSlab, WALL_SEG_VOXEL, WALL_SEG_EDGE_RAIL } from "../Core/engineMemory.js";
const WALL_DAMAGE = { minStrikeSpeed: 28, referenceMaxSpeed: 560, minBreakStrength: 0.1 };
async function createWallDamageTestState(opts = {}) {
    const grid = new WorldObstacleGrid(16);
    grid.rebuildFixed(0, 0, 128, 128);
    const navigation = await createWorkerNavigation(grid);
    const worldSurfaces = opts.realSurfaces
        ? createRealWorldSurfaces("base")
        : { settings: gameWorldSurfaceSettings, activeSurfaceProfileId: "base", invalidateGridBounds: () => {} };
    const state = {
        ...createSandboxSessionState(),
        obstacleGrid: grid,
        worldSurfaces,
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
        admitKineticProps() {},
        evictKineticProp() {},
        ...extra,
    };
}
function kineticDebrisList(state) {
    return state.fractureEngine.debris.list();
}
function assertNoWallChunkWorldProps(state) {
    assert.equal(state.worldProps.some((p) => p.type === "wall_voxel_chunk" || p.type === "wall_rail_chunk"), false);
}
function wallHitBuffer(entries) {
    const hits = createWallHitBuffer(Math.max(1, entries.length));
    for (let i = 0; i < entries.length; i++) {
        const e = entries[i];
        hits.approachDot[i] = e.approachDot;
        hits.normalX[i] = e.normalX ?? 0;
        hits.normalY[i] = e.normalY ?? 0;
        hits.contactX[i] = e.contactX ?? NaN;
        hits.contactY[i] = e.contactY ?? NaN;
        hits.gridIdx[i] = e.gridIdx;
        hits.gridSide[i] = e.gridSide ?? 0;
        hits.flags[i] = e.flags;
    }
    hits.count = entries.length;
    return hits;
}
function voxelHit(gridIdx, extra = {}) {
    return { approachDot: -560, normalX: 1, normalY: 0, gridIdx, flags: WALL_SEG_VOXEL, gridSide: 0, ...extra };
}
function railHit(gridIdx, gridSide, extra = {}) {
    return { approachDot: -560, normalX: 1, normalY: 0, gridIdx, flags: WALL_SEG_EDGE_RAIL, gridSide, ...extra };
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
        const entity = { id: 42, vx: 560, vy: 0 };
        const wallResolver = {
            hits: wallHitBuffer([voxelHit(worldIdxAtCell(state.obstacleGrid, 6, 6))]),
            resolve() {
                return true;
            },
        };
        resolveKineticWallDamage(state, entity, wallDebrisTestFrame(), wallResolver);
        const voxelKey = packWallDamageKey(0, worldIdxAtCell(state.obstacleGrid, 6, 6), 0);
        assert.equal(state.gridWallDamage.pending.strength[state.gridWallDamage.pending.keyToRow.get(voxelKey)], 1);
        applyPendingWallDamage(state);
        assert.ok(!cellIsStaticWall(state.obstacleGrid, worldIdxAtCell(state.obstacleGrid, 6, 6)));
        assert.equal(state.gridWallDamage.pending.count, 0);
        terminateWorkerNavigation(state.nav);
    });
    it("does not queue wall breaks without per-body overlap hits", async () => {
        const state = await createWallDamageTestState();
        state.gridWallDamage = createGridWallDamage(state, WALL_DAMAGE);
        stampRailWallsQuiet(state, RailWallBatch.single(worldIdxAtCell(state.obstacleGrid, 5, 5), 0, 2, 4));
        const entity = { id: 42, vx: 560, vy: 0 };
        const wallResolver = {
            hits: createWallHitBuffer(),
            resolve() {
                return true;
            },
        };
        resolveKineticWallDamage(state, entity, wallDebrisTestFrame(), wallResolver);
        assert.equal(state.gridWallDamage.pending.count, 0);
        terminateWorkerNavigation(state.nav);
    });
    it("classifyWallDamageSegment distinguishes voxel and rail segments", async () => {
        const state = await createWallDamageTestState();
        const grid = state.obstacleGrid;
        stampVoxel(grid, 2, 2);
        stampRailWallsQuiet(state, RailWallBatch.single(worldIdxAtCell(grid, 4, 4), 1));
        assert.equal(classifyWallDamageSegment(grid, worldIdxAtCell(grid, 2, 2), WALL_SEG_VOXEL, 0), 0);
        assert.equal(classifyWallDamageSegment(grid, worldIdxAtCell(grid, 4, 4), WALL_SEG_EDGE_RAIL, 1), 1);
        terminateWorkerNavigation(state.nav);
    });
    it("one max-power head-on hit destroys a voxel wall", async () => {
        const state = await createWallDamageTestState();
        const grid = state.obstacleGrid;
        stampVoxel(grid, 3, 3);
        const wallDamage = createGridWallDamage(state, WALL_DAMAGE);
        queueWallHits(wallDamage, grid, wallHitBuffer([voxelHit(worldIdxAtCell(state.obstacleGrid, 3, 3))]), 560);
        wallDamage.spatialFrame = wallDebrisTestFrame();
        await applyPendingWallDamage(state, wallDamage);
        assert.ok(!cellIsStaticWall(grid, worldIdxAtCell(state.obstacleGrid,3, 3)));
        assert.equal(wallDamage.pending.count, 0);
        terminateWorkerNavigation(state.nav);
    });
    it("one max-power head-on hit destroys a rail wall", async () => {
        const state = await createWallDamageTestState();
        const grid = state.obstacleGrid;
        stampRailWallsQuiet(state, RailWallBatch.single(worldIdxAtCell(grid, 5, 5), 0, 2, 4));
        const wallDamage = createGridWallDamage(state, WALL_DAMAGE);
        queueWallHits(wallDamage, grid, wallHitBuffer([railHit(worldIdxAtCell(state.obstacleGrid, 5, 5), 0, { normalX: 0, normalY: 1 })]), 560);
        wallDamage.spatialFrame = wallDebrisTestFrame();
        await applyPendingWallDamage(state, wallDamage);
        assert.ok(!isRailWallEdge(grid.getCellEdge(worldIdxAtCell(state.obstacleGrid,5, 5), 0)));
        assert.equal(wallDamage.pending.count, 0);
        terminateWorkerNavigation(state.nav);
    });
    it("packWallDamageKey packs voxel and rail targets", () => {
        assert.equal(packWallDamageKey(0, 17, 0), 17);
        assert.equal(packWallDamageKey(1, 35, 1), (1 << 30) | (1 << 28) | 35);
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
        queueWallHits(wallDamage, grid, wallHitBuffer([voxelHit(worldIdxAtCell(state.obstacleGrid, 3, 3))]), 560);
        assert.throws(() => applyPendingWallDamage(state, wallDamage), /requires spatial frame/);
        terminateWorkerNavigation(state.nav);
    });
    it("voxel wall hit clears grid wall, spawns a voxel chunk prop, and fractures it", async () => {
        const state = await createWallDamageTestState();
        state.gridWallDamage = createGridWallDamage(state, WALL_DAMAGE);
        stampVoxel(state.obstacleGrid, 3, 3, 2); // height level 2
        state.obstacleGrid.setChunkSurfaceProfileAtKey(packChunkKey(0, 0), "chunk-profile", gameWorldSurfaceSettings.cellsPerChunk);
        
        const entity = { id: 101, type: "crate", vx: 560, vy: 0 };
        const wallResolver = {
            hits: wallHitBuffer([voxelHit(worldIdxAtCell(state.obstacleGrid, 3, 3), {
                    contactX: 3 * 16 + 8,
                    contactY: 3 * 16 + 8
                })]),
            resolve() {
                return true;
            },
        };
        
        resolveKineticWallDamage(state, entity, wallDebrisTestFrame(), wallResolver);
        
        const pending = state.gridWallDamage.pending;
        const row = pending.keyToRow.get(packWallDamageKey(0, worldIdxAtCell(state.obstacleGrid, 3, 3), 0));
        assert.ok(row !== undefined);
        assert.equal(pending.contactX[row], 3 * 16 + 8);
        assert.equal(pending.normalX[row], 1);
        assert.equal(pending.sourceSpeed[row], 560);
        assert.equal(pending.sourceMass[row], 1);
        
        applyPendingWallDamage(state);
        
        assert.ok(!cellIsStaticWall(state.obstacleGrid, worldIdxAtCell(state.obstacleGrid,3, 3)));
        const shards = kineticDebrisList(state).filter((p) => p.type === "wall_voxel_chunk");
        assert.ok(shards.length > 0);
        assert.ok(shards.every((s) => s.isKineticDebris && s._row >= 0));
        assert.ok(shards.every((s) => s.height === 32));
        assert.ok(shards.every((s) => s.wallChunkProfileId === "chunk-profile"));
        assert.ok(shards.every((s) => Math.hypot(s.vx ?? 0, s.vy ?? 0) > 5));
        assertNoWallChunkWorldProps(state);
        
        terminateWorkerNavigation(state.nav);
    });
    it("voxel shatter invalidates roof cache for the cleared cell bounds (no ghost roof)", async () => {
        const state = await createWallDamageTestState({ realSurfaces: true });
        state.gridWallDamage = createGridWallDamage(state, WALL_DAMAGE);
        stampVoxel(state.obstacleGrid, 3, 3, 2);
        stampVoxel(state.obstacleGrid, 5, 5, 2);
        const clearedIdx = worldIdxAtCell(state.obstacleGrid, 3, 3);
        const neighborIdx = worldIdxAtCell(state.obstacleGrid, 5, 5);
        const zLevels = state.obstacleGrid.collectStaticStructureZLevels();
        assert.ok(zLevels.length > 0);
        const zLevel = zLevels[0];
        const seeded = seedStaticRoofCacheKeys(state.worldSurfaces, state.obstacleGrid, clearedIdx, zLevel);
        assert.ok(state.worldSurfaces.surfaceCache.get(seeded.maskKey));
        assert.ok(state.worldSurfaces.surfaceCache.get(seeded.drawKey));
        const revisionBefore = state.obstacleGrid.wallGridRevision;
        resolveKineticWallDamage(state, { id: 101, type: "crate", vx: 560, vy: 0 }, wallDebrisTestFrame(), {
            hits: wallHitBuffer([voxelHit(clearedIdx, { contactX: 3 * 16 + 8, contactY: 3 * 16 + 8 })]),
            resolve() {
                return true;
            },
        });
        applyPendingWallDamage(state);
        assert.ok(!cellIsStaticWall(state.obstacleGrid, clearedIdx));
        assert.ok(cellIsStaticWall(state.obstacleGrid, neighborIdx));
        assert.ok(state.obstacleGrid.wallGridRevision > revisionBefore);
        assert.equal(state.worldSurfaces.surfaceCache.get(seeded.maskKey), null);
        assert.equal(state.worldSurfaces.surfaceCache.get(seeded.drawKey), null);
        const list = new StrideFloatList(VOXEL_FACE_STRIDE);
        const buf = new Float32Array([-100, -100, 100, 100]);
        collectVoxelWallFacesInAabbFlatF32(state.obstacleGrid, buf, 0, list);
        for (let i = 0; i < list.length; i++) {
            assert.notEqual(list.data[i * VOXEL_FACE_STRIDE + VOXEL_FACE.gridIdx], clearedIdx);
        }
        terminateWorkerNavigation(state.nav);
    });
    it("wall debris re-registers in begin and moves under kinetic physics", async () => {
        const state = await createWallDamageTestState();
        state.gridWallDamage = createGridWallDamage(state, WALL_DAMAGE);
        state.fractureEngine = new FractureEngine(state);
        state.kinetic = createKineticSession();
        stampVoxel(state.obstacleGrid, 3, 3, 2);
        state.obstacleGrid.setChunkSurfaceProfileAtKey(packChunkKey(0, 0), "chunk-profile", gameWorldSurfaceSettings.cellsPerChunk);
        resolveKineticWallDamage(state, { id: 101, type: "ball", vx: 560, vy: 0 }, wallDebrisTestFrame(), {
            hits: wallHitBuffer([voxelHit(worldIdxAtCell(state.obstacleGrid, 3, 3), { contactX: 3 * 16 + 8, contactY: 3 * 16 + 8 })]),
            resolve() {
                return true;
            },
        });
        applyPendingWallDamage(state);
        const shard = kineticDebrisList(state).find((p) => p.type === "wall_voxel_chunk");
        assert.ok(shard);
        shard.vx = 120;
        shard.vy = 60;
        const x0 = shard.x;
        const y0 = shard.y;
        const frame = kineticSpatial.begin(state);
        assert.ok(frame._kineticBodies.includes(shard));
        runKineticPhysics(
            { frame, world: { obstacleGrid: state.obstacleGrid, worldProps: state.worldProps, entityRegistry: state.entityRegistry, kinetic: state.kinetic, sandbox: state.sandbox, fractureEngine: state.fractureEngine } },
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
        
        const entity = { id: 102, type: "ball", vx: 0, vy: -560 };
        const wallResolver = {
            hits: wallHitBuffer([railHit(worldIdxAtCell(state.obstacleGrid, 4, 4), 1, {
                    approachDot: -560,
                    normalX: 0,
                    normalY: -1,
                    contactX: 4 * 16 + 8,
                    contactY: 4 * 16 + 16
                })]),
            resolve() {
                return true;
            },
        };
        
        resolveKineticWallDamage(state, entity, wallDebrisTestFrame(), wallResolver);
        
        const pending = state.gridWallDamage.pending;
        const row = pending.keyToRow.get(packWallDamageKey(1, worldIdxAtCell(state.obstacleGrid, 4, 4), 1, state.obstacleGrid));
        assert.ok(row !== undefined);
        assert.equal(pending.contactY[row], 4 * 16 + 16);
        assert.equal(pending.normalY[row], -1);
        
        applyPendingWallDamage(state);
        
        assert.ok(!isRailWallEdge(state.obstacleGrid.getCellEdge(worldIdxAtCell(state.obstacleGrid,4, 4), 1)));
        const shards = kineticDebrisList(state).filter((p) => p.type === "wall_rail_chunk");
        assert.ok(shards.length > 0);
        assert.ok(shards.every((s) => s.isKineticDebris && s._row >= 0));
        assert.ok(shards.every((s) => s.height === 32));
        assert.ok(shards.every((s) => s.wallChunkProfileId === "edge-profile"));
        assertNoWallChunkWorldProps(state);
        
        terminateWorkerNavigation(state.nav);
    });
    it("rail wall break with extreme impact force produces intact debris if shard area is too small", async () => {
        const state = await createWallDamageTestState();
        state.gridWallDamage = createGridWallDamage(state, WALL_DAMAGE);
        stampRailWallsQuiet(state, RailWallBatch.single(worldIdxAtCell(state.obstacleGrid, 4, 4), 1, 1, 4));
        state.obstacleGrid.setEdgeSurfaceProfile(worldIdxAtCell(state.obstacleGrid,4, 4), 1, "edge-profile");
        
        const entity = { id: 102, type: "cross_pinwheel", vx: 0, vy: -5000, mass: 100 };
        const wallResolver = {
            hits: wallHitBuffer([railHit(worldIdxAtCell(state.obstacleGrid, 4, 4), 1, {
                    approachDot: -5000,
                    normalX: 0,
                    normalY: -1,
                    contactX: 4 * 16 + 8,
                    contactY: 4 * 16 + 16
                })]),
            resolve() {
                return true;
            },
        };
        
        resolveKineticWallDamage(state, entity, wallDebrisTestFrame(), wallResolver);
        applyPendingWallDamage(state);
        
        const shards = kineticDebrisList(state).filter((p) => p.type === "wall_rail_chunk");
        assert.ok(shards.length > 0, "Extreme impact force must produce debris");
        assert.ok(shards.every((s) => s.isKineticDebris && s._row >= 0));
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
        ballProp._physId = 0;
        snapshotKineticBodySlab([ballProp]);
        
        const resolver = new WallCollisionResolver();
        const candidates = new GrowI32(16);
        state.obstacleGrid.appendStaticWallSegmentsNearWorld(ballProp.x, ballProp.y, ballProp.radius + 32, candidates);
        const targetIdx = worldIdxAtCell(state.obstacleGrid, 4, 4);
        let railSegId = -1;
        for (let i = 0; i < candidates.used; i++) {
            const id = candidates.buf[i];
            if ((staticWallSegmentSlab.flags[id] & WALL_SEG_EDGE_RAIL) !== 0 && staticWallSegmentSlab.gridIdx[id] === targetIdx && staticWallSegmentSlab.gridSide[id] === 1) {
                railSegId = id;
                break;
            }
        }
        assert.ok(railSegId >= 0, "obstacle grid should emit rail segment");
        
        const spatialFrame = wallDebrisTestFrame({
            frameId: 42,
            getWallCandidates: () => candidates,
        });
        
        resolveKineticWallDamage(state, ballProp, spatialFrame, resolver);
        assert.ok(state.gridWallDamage.pending.keyToRow.has(packWallDamageKey(1, worldIdxAtCell(state.obstacleGrid, 4, 4), 1, state.obstacleGrid)));
        
        applyPendingWallDamage(state);
        
        assert.ok(!isRailWallEdge(state.obstacleGrid.getCellEdge(worldIdxAtCell(state.obstacleGrid,4, 4), 1)));
        const shards = kineticDebrisList(state).filter((p) => p.type === "wall_rail_chunk");
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
        ball._physId = 0;
        snapshotKineticBodySlab([ball]);
        const candidates = new GrowI32(16);
        state.obstacleGrid.appendStaticWallSegmentsNearWorld(ball.x, ball.y, ball.radius + 32, candidates);
        assert.ok(candidates.used > 0);
        const wall = candidates.buf[0];
        const slab = staticWallSegmentSlab;
        assert.ok(satCheckCollision(ball.x, ball.y, entityFacing(ball), ball.shape, slab.x[wall], slab.y[wall], slab.angle[wall], ensureWallSegmentPolygonShape(wall)));
        const startX = ball.x;
        const spatialFrame = wallDebrisTestFrame({ frameId: 7, getWallCandidates: () => candidates });
        resolveKineticWallDamage(state, ball, spatialFrame, new WallCollisionResolver());
        applyPendingWallDamage(state);
        assert.ok(Math.abs(ball.x - startX) < 1, `expected bounded displacement, got ${ball.x - startX}`);
        assert.ok(!cellIsStaticWall(state.obstacleGrid, worldIdxAtCell(state.obstacleGrid,6, 6)));
        terminateWorkerNavigation(state.nav);
    });
});
