import "./nodeCanvasSetup.js";
import assert from "node:assert/strict";
import { packChunkKey } from "../Libraries/Spatial/spatial.js";
import { describe, it } from "node:test";
import { computeWallBreakStrength, applyPendingWallDamage, createGridWallDamage, queueWallHits, resolveKineticWallDamage, classifyWallDamageSegment, packWallDamageKey } from "../Libraries/Physics/fracture.js";
import { pendingBreakRowForKey, GrowI32, staticWallSegmentSlab, kineticStaticSlab, entityVx, entityVy } from "../Core/engineMemory.js";
import { stampRailWallsQuiet, RailWallBatch } from "../Libraries/Spatial/spatial.js";
import {  isRailWallEdge  } from "../Libraries/Spatial/spatial.js";
import {  cellIsStaticWall  } from "../Libraries/Spatial/spatial.js";
import { worldIdxAtCell } from "./harness/testGridUtils.js";
import {  WorldObstacleGrid  } from "../Libraries/Spatial/spatial.js";
import { createWorkerNavigation, terminateWorkerNavigation } from "./WorkerNavigationFactory.js";
import { gameWorldSurfaceSettings } from "../Render/WorldSurfaceBootstrap.js";
import { EntityRegistry } from "../GameState/EntityRegistry.js";
import { FractureEngine, FRACTURE_TUNING } from "../Libraries/Physics/fracture.js";
import { WorldProp } from "../Libraries/Props/props.js";
import { WallCollisionResolver, createKineticSession, runKineticPhysics } from "../Libraries/Physics/physics.js";
import { createSandboxSessionState } from "./harness/stateFactories.js";
import { kineticSpatial } from "../Libraries/Spatial/spatial.js";
import {kineticPhysicsHooks, assignPhysIdWithPose, snapshotKineticBodySlab} from "./harness/kineticTickHarness.js";
import { createRealWorldSurfaces, seedStaticRoofCacheKeys } from "./harness/wallSurfaceInvalidateHarness.js";
import { collectVoxelWallFacesInAabbFlatF32 } from "../Libraries/World/wallGridBake.js";
import { VOXEL_FACE_GRID_IDX, VOXEL_FACE_STRIDE } from "../Libraries/World/wallGridStride.js";
import { StrideFloatList } from "../Libraries/World/StrideFloatList.js";
import { WALL_SEG_VOXEL, WALL_SEG_EDGE_RAIL, ENTITY_KIND_WORLD_PROP } from "../Core/engineEnums.js";
const WALL_DAMAGE = { minStrikeSpeed: 28, referenceMaxSpeed: 560, minBreakStrength: 0.1 };
function stampWallHitSource(eid, vx, vy, mass = 1) {
    entityVx[eid] = vx;
    entityVy[eid] = vy;
    kineticStaticSlab.mass[eid] = mass;
}
function hasLiveWallChunkProp(registry) {
    let found = false;
    registry.forEachOfKind(ENTITY_KIND_WORLD_PROP, (p) => {
        if (p.isDead) return;
        if (p.type === "wall_voxel_chunk" || p.type === "wall_rail_chunk") found = true;
    });
    return found;
}
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
        entityRegistry: new EntityRegistry(),
        kinetic: createKineticSession()
    };
    state.fractureEngine = new FractureEngine(state);
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
    assert.equal(hasLiveWallChunkProp(state.entityRegistry), false);
}
function createTestWallHitBuffer(capacity = 64) {
    return {
        count: 0,
        approachDot: new Float32Array(capacity),
        normalX: new Float32Array(capacity),
        normalY: new Float32Array(capacity),
        contactX: new Float32Array(capacity),
        contactY: new Float32Array(capacity),
        gridIdx: new Int32Array(capacity),
        gridSide: new Uint8Array(capacity),
        flags: new Uint8Array(capacity),
    };
}
function wallHitBuffer(entries) {
    const hits = createTestWallHitBuffer(Math.max(1, entries.length));
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
        stampWallHitSource(0, 560, 0, 1);
                state.wallResolver = {
            hits: wallHitBuffer([voxelHit(worldIdxAtCell(state.obstacleGrid, 6, 6))]),
            resolve() {
                return true;
            },
        };
        resolveKineticWallDamage(state, 0, wallDebrisTestFrame());
        const voxelKey = packWallDamageKey(0, worldIdxAtCell(state.obstacleGrid, 6, 6), 0);
        assert.equal(state.gridWallDamage.pending.strength[pendingBreakRowForKey(voxelKey)], 1);
        applyPendingWallDamage(state);
        assert.ok(!cellIsStaticWall(state.obstacleGrid, worldIdxAtCell(state.obstacleGrid, 6, 6)));
        assert.equal(state.gridWallDamage.pending.count, 0);
        terminateWorkerNavigation(state.nav);
    });
    it("does not queue wall breaks without per-body overlap hits", async () => {
        const state = await createWallDamageTestState();
        state.gridWallDamage = createGridWallDamage(state, WALL_DAMAGE);
        stampRailWallsQuiet(state, RailWallBatch.single(worldIdxAtCell(state.obstacleGrid, 5, 5), 0, 2, 4));
        stampWallHitSource(0, 560, 0, 1);
                state.wallResolver = {
            hits: createTestWallHitBuffer(),
            resolve() {
                return true;
            },
        };
        resolveKineticWallDamage(state, 0, wallDebrisTestFrame());
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
        state.gridWallDamage = wallDamage;
        stampWallHitSource(0, 0, 0, 1);
        queueWallHits(wallDamage, grid, wallHitBuffer([voxelHit(worldIdxAtCell(state.obstacleGrid, 3, 3))]), 560, 0);
        wallDamage.spatialFrame = wallDebrisTestFrame();
        await applyPendingWallDamage(state);
        assert.ok(!cellIsStaticWall(grid, worldIdxAtCell(state.obstacleGrid,3, 3)));
        assert.equal(wallDamage.pending.count, 0);
        terminateWorkerNavigation(state.nav);
    });
    it("one max-power head-on hit destroys a rail wall", async () => {
        const state = await createWallDamageTestState();
        const grid = state.obstacleGrid;
        stampRailWallsQuiet(state, RailWallBatch.single(worldIdxAtCell(grid, 5, 5), 0, 2, 4));
        const wallDamage = createGridWallDamage(state, WALL_DAMAGE);
        state.gridWallDamage = wallDamage;
        stampWallHitSource(0, 0, 0, 1);
        queueWallHits(wallDamage, grid, wallHitBuffer([railHit(worldIdxAtCell(state.obstacleGrid, 5, 5), 0, { normalX: 0, normalY: 1 })]), 560, 0);
        wallDamage.spatialFrame = wallDebrisTestFrame();
        await applyPendingWallDamage(state);
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
        state.gridWallDamage = wallDamage;
        stampWallHitSource(0, 0, 0, 1);
        queueWallHits(wallDamage, grid, wallHitBuffer([voxelHit(worldIdxAtCell(state.obstacleGrid, 3, 3))]), 560, 0);
        assert.throws(() => applyPendingWallDamage(state));
        terminateWorkerNavigation(state.nav);
    });
    it("voxel wall hit clears grid wall, spawns a voxel chunk prop, and fractures it", async () => {
        const state = await createWallDamageTestState();
        state.gridWallDamage = createGridWallDamage(state, WALL_DAMAGE);
        stampVoxel(state.obstacleGrid, 3, 3, 2); // height level 2
        state.obstacleGrid.setChunkSurfaceProfileAtKey(packChunkKey(0, 0), "chunk-profile", gameWorldSurfaceSettings.cellsPerChunk);
        
        stampWallHitSource(0, 560, 0, 1);
                state.wallResolver = {
            hits: wallHitBuffer([voxelHit(worldIdxAtCell(state.obstacleGrid, 3, 3), {
                    contactX: 3 * 16 + 8,
                    contactY: 3 * 16 + 8
                })]),
            resolve() {
                return true;
            },
        };
        resolveKineticWallDamage(state, 0, wallDebrisTestFrame());
        
        const pending = state.gridWallDamage.pending;
        const row = pendingBreakRowForKey(packWallDamageKey(0, worldIdxAtCell(state.obstacleGrid, 3, 3), 0));
        assert.ok(row >= 0);
        assert.equal(pending.contactX[row], 3 * 16 + 8);
        assert.equal(pending.normalX[row], 1);
        assert.equal(pending.sourceSpeed[row], 560);
        assert.equal(pending.sourceMass[row], 1);
        
        applyPendingWallDamage(state);
        
        assert.ok(!cellIsStaticWall(state.obstacleGrid, worldIdxAtCell(state.obstacleGrid,3, 3)));
        const shards = kineticDebrisList(state).filter((p) => p.type === "wall_voxel_chunk");
        assert.ok(shards.length > 0);
        assert.ok(shards.every((s) => s.isKineticDebris));
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
        stampWallHitSource(0, 560, 0, 1);
        state.wallResolver = {
            hits: wallHitBuffer([voxelHit(clearedIdx, { contactX: 3 * 16 + 8, contactY: 3 * 16 + 8 })]),
            resolve() {
                return true;
            },
        };
        resolveKineticWallDamage(state, 0, wallDebrisTestFrame());
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
            assert.notEqual(list.data[i * VOXEL_FACE_STRIDE + VOXEL_FACE_GRID_IDX], clearedIdx);
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
        stampWallHitSource(0, 560, 0, 1);
        state.wallResolver = {
            hits: wallHitBuffer([voxelHit(worldIdxAtCell(state.obstacleGrid, 3, 3), { contactX: 3 * 16 + 8, contactY: 3 * 16 + 8 })]),
            resolve() {
                return true;
            },
        };
        const frame = kineticSpatial.begin(state);
        resolveKineticWallDamage(state, 0, frame);
        applyPendingWallDamage(state);
        const shard = kineticDebrisList(state).find((p) => p.type === "wall_voxel_chunk");
        assert.ok(shard);
        assert.ok(Math.hypot(shard.vx, shard.vy) > 5, "spawn impulse must survive admit bind");
        const x0 = shard.x;
        const y0 = shard.y;
        state.fractureEngine.debris.integrateSpawned(frame, state.gridWallDamage.lastSpawned, 16);
        assert.ok(Math.hypot(shard.x - x0, shard.y - y0) > 0.5, "integrateSpawned must move shards on spawn frame");
        const frame2 = kineticSpatial.begin(state);
        assert.ok(Array.from(frame2.kineticEids.subarray(0, frame2.kineticEidCount)).includes(shard._physId));
        runKineticPhysics(frame2, state, 100, kineticPhysicsHooks());
        assert.ok(Math.hypot(shard.x - x0, shard.y - y0) > 1);
        terminateWorkerNavigation(state.nav);
    });
    it("recycled debris bags keep spawn impulse after admit (stale _spawnVx must not wipe SoA)", async () => {
        const state = await createWallDamageTestState();
        state.gridWallDamage = createGridWallDamage(state, WALL_DAMAGE);
        state.fractureEngine = new FractureEngine(state);
        state.kinetic = createKineticSession();
        stampVoxel(state.obstacleGrid, 3, 3, 2);
        state.obstacleGrid.setChunkSurfaceProfileAtKey(packChunkKey(0, 0), "chunk-profile", gameWorldSurfaceSettings.cellsPerChunk);
        stampWallHitSource(0, 560, 0, 1);
        state.wallResolver = {
            hits: wallHitBuffer([voxelHit(worldIdxAtCell(state.obstacleGrid, 3, 3), { contactX: 3 * 16 + 8, contactY: 3 * 16 + 8 })]),
            resolve() {
                return true;
            },
        };
        let frame = kineticSpatial.begin(state);
        resolveKineticWallDamage(state, 0, frame);
        applyPendingWallDamage(state);
        const first = kineticDebrisList(state).slice();
        assert.ok(first.length > 0);
        for (let i = 0; i < first.length; i++) state.fractureEngine.debris.remove(first[i], frame);
        assert.equal(kineticDebrisList(state).length, 0);
        stampVoxel(state.obstacleGrid, 5, 5, 2);
        stampWallHitSource(0, 560, 0, 1);
        state.wallResolver = {
            hits: wallHitBuffer([voxelHit(worldIdxAtCell(state.obstacleGrid, 5, 5), { contactX: 5 * 16 + 8, contactY: 5 * 16 + 8 })]),
            resolve() {
                return true;
            },
        };
        frame = kineticSpatial.begin(state);
        resolveKineticWallDamage(state, 0, frame);
        applyPendingWallDamage(state);
        const recycled = kineticDebrisList(state);
        assert.ok(recycled.length > 0);
        assert.ok(recycled.every((s) => Math.hypot(s.vx, s.vy) > 5), "recycled admit must not zero spawn velocity via stale _spawnVx");
        terminateWorkerNavigation(state.nav);
    });
    it("rail wall hit clears edge wall, spawns a rail chunk prop, and fractures it", async () => {
        const state = await createWallDamageTestState();
        state.gridWallDamage = createGridWallDamage(state, WALL_DAMAGE);
        stampRailWallsQuiet(state, RailWallBatch.single(worldIdxAtCell(state.obstacleGrid, 4, 4), 1, 2, 4));
        state.obstacleGrid.setEdgeSurfaceProfile(worldIdxAtCell(state.obstacleGrid,4, 4), 1, "edge-profile");
        
        stampWallHitSource(0, 0, -560, 1);
                state.wallResolver = {
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
        resolveKineticWallDamage(state, 0, wallDebrisTestFrame());
        
        const pending = state.gridWallDamage.pending;
        const row = pendingBreakRowForKey(packWallDamageKey(1, worldIdxAtCell(state.obstacleGrid, 4, 4), 1, state.obstacleGrid));
        assert.ok(row >= 0);
        assert.equal(pending.contactY[row], 4 * 16 + 16);
        assert.equal(pending.normalY[row], -1);
        
        applyPendingWallDamage(state);
        
        assert.ok(!isRailWallEdge(state.obstacleGrid.getCellEdge(worldIdxAtCell(state.obstacleGrid,4, 4), 1)));
        const shards = kineticDebrisList(state).filter((p) => p.type === "wall_rail_chunk");
        assert.ok(shards.length > 0);
        assert.ok(shards.every((s) => s.isKineticDebris));
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
        
        stampWallHitSource(0, 0, -5000, 100);
                state.wallResolver = {
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
        resolveKineticWallDamage(state, 0, wallDebrisTestFrame());
        applyPendingWallDamage(state);
        
        const shards = kineticDebrisList(state).filter((p) => p.type === "wall_rail_chunk");
        assert.ok(shards.length > 0, "Extreme impact force must produce debris");
        assert.ok(shards.every((s) => s.isKineticDebris));
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
        assignPhysIdWithPose(ballProp, 0);
        snapshotKineticBodySlab([ballProp._physId], 1);
        
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
        
        state.wallResolver = resolver;
        resolveKineticWallDamage(state, ballProp._physId, spatialFrame);
        assert.ok(pendingBreakRowForKey(packWallDamageKey(1, worldIdxAtCell(state.obstacleGrid, 4, 4), 1, state.obstacleGrid)) >= 0);
        
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
        assignPhysIdWithPose(ball, 0);
        snapshotKineticBodySlab([ball._physId], 1);
        const candidates = new GrowI32(16);
        state.obstacleGrid.appendStaticWallSegmentsNearWorld(ball.x, ball.y, ball.radius + 32, candidates);
        assert.ok(candidates.used > 0);
        const startX = ball.x;
        const spatialFrame = wallDebrisTestFrame({ frameId: 7, getWallCandidates: () => candidates });
        state.wallResolver = new WallCollisionResolver();
        resolveKineticWallDamage(state, ball._physId, spatialFrame);
        applyPendingWallDamage(state);
        assert.ok(Math.abs(ball.x - startX) < 1, `expected bounded displacement, got ${ball.x - startX}`);
        assert.ok(!cellIsStaticWall(state.obstacleGrid, worldIdxAtCell(state.obstacleGrid,6, 6)));
        terminateWorkerNavigation(state.nav);
    });
});
