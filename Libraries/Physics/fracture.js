import { removeWorldPropFromState } from "../../GameState/EntityRegistry.js";
import propCatalog from "../../Assets/props/index.js";
import { entityFacing, wakeKineticBody, kineticDynamicSlab, KINETIC_PAIR_TIER, PolygonShape, markBroadphaseDirty, kineticMassFromFootprint, applyVelocityDamping, snapshotKineticBodySlab, normalizeKineticBody } from "./physics.js";
import { createDeferredGridWallCommit, getVoxelWallInfo, getRailWallInfo, resolveCellSurfaceProfileId, resolveEdgeSurfaceProfileId, isRailWallEdge, cellIsStaticWall, cellEdgeEndpointsIdx, RailWallBatch } from "../Spatial/spatial.js";
import { transformPoint2DInto, boxLocalFootprint, convexFootprintHalfExtents, polygonCentroid2D, pointInPolygon, polygonSignedArea2D, closestPointOnLineSegment, deterministicUnitRandom } from "../Math/math.js";
import { applyPropBoxFootprint, buildWorldPropStrategyFromAsset } from "../Props/props.js";
export const FRACTURE_TUNING = { shared: { minPieceSize: 5, cooldown: 8 }, glass: { impactThreshold: 6, minShardArea: 12, maxShardsPerShatter: 12 }, wallSpawn: { forceBias: 10 }, burst: { maxBurst: 35, baseBurst: 8, burstForceScale: 0.12, spinScale: 0.4 } };
const GLASS_FRACTURE_IMPACT_THRESHOLD = FRACTURE_TUNING.glass.impactThreshold;
const GLASS_MIN_SHARD_AREA = FRACTURE_TUNING.glass.minShardArea;
export const GLASS_MAX_SHARDS_PER_SHATTER = FRACTURE_TUNING.glass.maxShardsPerShatter;
const FRACTURE_MIN_PIECE_SIZE = FRACTURE_TUNING.shared.minPieceSize;
const SHATTER_SEEDS = [];
const SHARED_CENTROID = { cx: 0, cy: 0, signedArea: 0 };
const GEOM_VERT_BUCKETS = [8, 16, 32, 64, 128, 256, 512];
const MAX_FRACTURE_DEBRIS = FRACTURE_TUNING.burst.maxBurst;
const MAX_CLIP_VERTS = 512;
const MAX_KINETIC_DEBRIS = 4096;
const kineticDebrisSlab = { activeCount: 0, x: new Float32Array(MAX_KINETIC_DEBRIS), y: new Float32Array(MAX_KINETIC_DEBRIS), vx: new Float32Array(MAX_KINETIC_DEBRIS), vy: new Float32Array(MAX_KINETIC_DEBRIS), w: new Float32Array(MAX_KINETIC_DEBRIS), facing: new Float32Array(MAX_KINETIC_DEBRIS), ageMs: new Float32Array(MAX_KINETIC_DEBRIS), alpha: new Float32Array(MAX_KINETIC_DEBRIS) };
const kineticDebrisFreePool = [];
let kineticDebrisNextId = 0x50000000;
class FractureGeomPool {
    constructor() {
        this.buckets = GEOM_VERT_BUCKETS.map(() => []);
        this.live = new Map();
        this.nextHandle = 1;
        this.clipA = new Float32Array(MAX_CLIP_VERTS * 2);
        this.clipB = new Float32Array(MAX_CLIP_VERTS * 2);
    }
    _bucketIndex(minCap) {
        for (let i = 0; i < GEOM_VERT_BUCKETS.length; i++) if (GEOM_VERT_BUCKETS[i] >= minCap) return i;
        return GEOM_VERT_BUCKETS.length - 1;
    }
    borrow(minVertCapacity) {
        const bucket = this._bucketIndex(minVertCapacity);
        const capacity = GEOM_VERT_BUCKETS[bucket];
        const floatCapacity = capacity * 2;
        let buffer = this.buckets[bucket].pop();
        if (!buffer || buffer.length < floatCapacity) buffer = new Float32Array(floatCapacity);
        const handle = this.nextHandle++;
        this.live.set(handle, { buffer, bucket });
        return handle;
    }
    release(handle) {
        if (!handle) return;
        const entry = this.live.get(handle);
        if (!entry) return;
        this.live.delete(handle);
        this.buckets[entry.bucket].push(entry.buffer);
    }
    buffer(handle) {
        return this.live.get(handle).buffer;
    }
    copyVerts(handle, src, vertCount) {
        const dst = this.buffer(handle);
        const n = vertCount * 2;
        for (let i = 0; i < n; i++) dst[i] = src[i];
    }
    clipHalfPlaneInPlace(src, srcVertCount, ax, ay, nx, ny, dst) {
        if (srcVertCount === 0) return 0;
        let outCount = 0;
        for (let i = 0; i < srcVertCount; i++) {
            const j = (i + 1) % srcVertCount;
            const cx = src[i * 2];
            const cy = src[i * 2 + 1];
            const nxCoord = src[j * 2];
            const nyCoord = src[j * 2 + 1];
            const currIn = (cx - ax) * nx + (cy - ay) * ny >= -1e-9;
            const nextIn = (nxCoord - ax) * nx + (nyCoord - ay) * ny >= -1e-9;
            if (currIn && nextIn) {
                dst[outCount * 2] = nxCoord;
                dst[outCount * 2 + 1] = nyCoord;
                outCount++;
            } else if (currIn && !nextIn) {
                const dx = nxCoord - cx;
                const dy = nyCoord - cy;
                const denom = dx * nx + dy * ny;
                const t = denom === 0 ? 0 : -((cx - ax) * nx + (cy - ay) * ny) / denom;
                dst[outCount * 2] = cx + dx * t;
                dst[outCount * 2 + 1] = cy + dy * t;
                outCount++;
            } else if (!currIn && nextIn) {
                const dx = nxCoord - cx;
                const dy = nyCoord - cy;
                const denom = dx * nx + dy * ny;
                const t = denom === 0 ? 0 : -((cx - ax) * nx + (cy - ay) * ny) / denom;
                dst[outCount * 2] = cx + dx * t;
                dst[outCount * 2 + 1] = cy + dy * t;
                outCount++;
                dst[outCount * 2] = nxCoord;
                dst[outCount * 2 + 1] = nyCoord;
                outCount++;
            }
        }
        return outCount;
    }
    voronoiCell(flatVerts, vertCount, seeds, seedIndex, seedCount) {
        let count = vertCount;
        for (let k = 0; k < count; k++) {
            this.clipA[k * 2] = flatVerts[k * 2];
            this.clipA[k * 2 + 1] = flatVerts[k * 2 + 1];
        }
        const six = seeds[seedIndex * 2];
        const siy = seeds[seedIndex * 2 + 1];
        let src = this.clipA;
        let dst = this.clipB;
        for (let j = 0; j < seedCount; j++) {
            if (j === seedIndex) continue;
            const sjx = seeds[j * 2];
            const sjy = seeds[j * 2 + 1];
            const mx = (six + sjx) * 0.5;
            const my = (siy + sjy) * 0.5;
            count = this.clipHalfPlaneInPlace(src, count, mx, my, six - sjx, siy - sjy, dst);
            if (count < 3) return { handle: 0, vertCount: 0 };
            const tmp = src;
            src = dst;
            dst = tmp;
        }
        const handle = this.borrow(count);
        this.copyVerts(handle, src, count);
        return { handle, vertCount: count };
    }
    centerVertsInPlace(handle, vertCount) {
        const buf = this.buffer(handle);
        const { cx, cy, signedArea } = polygonCentroid2D(buf.subarray(0, vertCount * 2), SHARED_CENTROID);
        for (let i = 0; i < vertCount; i++) {
            buf[i * 2] -= cx;
            buf[i * 2 + 1] -= cy;
        }
        const area = Math.abs(signedArea);
        let maxRadiusSq = 0;
        for (let i = 0; i < vertCount; i++) {
            const vx = buf[i * 2];
            const vy = buf[i * 2 + 1];
            const distSq = vx * vx + vy * vy;
            if (distSq > maxRadiusSq) maxRadiusSq = distSq;
        }
        return { cx, cy, area, boundingRadius: Math.sqrt(maxRadiusSq) };
    }
    footprintSlice(handle, vertCount) {
        return this.buffer(handle).slice(0, vertCount * 2);
    }
}
class FractureDebrisStore {
    constructor(geomPool) {
        this.geomPool = geomPool;
        this.write = 0;
        this.centroidX = new Float32Array(MAX_FRACTURE_DEBRIS);
        this.centroidY = new Float32Array(MAX_FRACTURE_DEBRIS);
        this.footprintArea = new Float32Array(MAX_FRACTURE_DEBRIS);
        this.boundingRadius = new Float32Array(MAX_FRACTURE_DEBRIS);
        this.vertHandle = new Uint32Array(MAX_FRACTURE_DEBRIS);
        this.vertCount = new Uint16Array(MAX_FRACTURE_DEBRIS);
    }
    reset() {
        this.write = 0;
    }
    appendCenteredPolygon(handle, vertCount, worldCentroidX = 0, worldCentroidY = 0) {
        if (this.write >= MAX_FRACTURE_DEBRIS) throw new Error("FractureDebrisStore capacity exceeded");
        const metrics = this.geomPool.centerVertsInPlace(handle, vertCount);
        const i = this.write++;
        this.vertHandle[i] = handle;
        this.vertCount[i] = vertCount;
        this.centroidX[i] = worldCentroidX + metrics.cx;
        this.centroidY[i] = worldCentroidY + metrics.cy;
        this.footprintArea[i] = metrics.area;
        this.boundingRadius[i] = metrics.boundingRadius;
        return i;
    }
    totalArea(start, count) {
        let total = 0;
        for (let i = start; i < start + count; i++) total += this.footprintArea[i];
        return total;
    }
}
const moduleGeomPool = new FractureGeomPool();
const moduleStores = { geom: moduleGeomPool, debris: new FractureDebrisStore(moduleGeomPool) };
function admitKineticPropsBatch(spatialFrame, props, world) {
    if (!props.length) return;
    if (!spatialFrame?.admitKineticProps) throw new Error("Kinetic shard admission requires spatial frame admitKineticProps");
    spatialFrame.admitKineticProps(props, world);
}
function materializePolygonDebris(stores, debrisIndex) {
    const debris = stores.debris;
    const handle = debris.vertHandle[debrisIndex];
    const vertCount = debris.vertCount[debrisIndex];
    const footprintVertices = stores.geom.footprintSlice(handle, vertCount);
    return { footprintVertices, footprintArea: debris.footprintArea[debrisIndex], boundingRadius: debris.boundingRadius[debrisIndex], centroid: { cx: debris.centroidX[debrisIndex], cy: debris.centroidY[debrisIndex] } };
}
function releaseDebrisGeomHandles(stores, start, count) {
    const debris = stores.debris;
    for (let i = start; i < start + count; i++) if (debris.vertHandle[i]) stores.geom.release(debris.vertHandle[i]);
}
class KineticDebrisBody {
    constructor(store) {
        this.isKineticDebris = true;
        this._store = store;
        this._row = -1;
        this._physId = undefined;
        this.id = 0;
        this.type = "";
        this.strategy = null;
        this.shape = undefined;
        this.collisionParts = undefined;
        this.chunks = undefined;
        this.footprintVertices = undefined;
        this.footprintArea = undefined;
        this.radius = 0;
        this.mass = 1;
        this.height = undefined;
        this.wallChunkProfileId = undefined;
        this.wallChunkHeightPx = undefined;
        this.faction = undefined;
        this.isSleeping = false;
        this.isDead = false;
        this._fractureCooldown = 0;
        this._neighbors = undefined;
        this._neighborsFrameId = -1;
    }
    get x() {
        return kineticDebrisSlab.x[this._row];
    }
    set x(v) {
        kineticDebrisSlab.x[this._row] = v;
    }
    get y() {
        return kineticDebrisSlab.y[this._row];
    }
    set y(v) {
        kineticDebrisSlab.y[this._row] = v;
    }
    get vx() {
        return kineticDebrisSlab.vx[this._row];
    }
    set vx(v) {
        kineticDebrisSlab.vx[this._row] = v;
    }
    get vy() {
        return kineticDebrisSlab.vy[this._row];
    }
    set vy(v) {
        kineticDebrisSlab.vy[this._row] = v;
    }
    get angularVelocity() {
        return kineticDebrisSlab.w[this._row];
    }
    set angularVelocity(v) {
        kineticDebrisSlab.w[this._row] = v;
    }
    get facing() {
        return kineticDebrisSlab.facing[this._row];
    }
    set facing(v) {
        kineticDebrisSlab.facing[this._row] = v;
    }
    get ageMs() {
        return kineticDebrisSlab.ageMs[this._row];
    }
    set ageMs(v) {
        kineticDebrisSlab.ageMs[this._row] = v;
    }
    get alpha() {
        return kineticDebrisSlab.alpha[this._row];
    }
    set alpha(v) {
        kineticDebrisSlab.alpha[this._row] = v;
    }
    get momentOfInertia() {
        return this.mass * this.radius * this.radius * 0.5;
    }
    getRender3DKey() {
        return this.strategy.render3DKey;
    }
    needsWallCollision() {
        return !this.isSleeping;
    }
    tickPropFrame(dt, _state, spatialFrame) {
        this.ageMs += dt;
        if (this.strategy.fadeOutMs !== undefined) {
            const fadeOutMs = this.strategy.fadeOutMs;
            const durationMs = this.strategy.fadeOutDurationMs ?? 1000;
            if (this.ageMs >= fadeOutMs + durationMs) {
                this._store.remove(this, spatialFrame);
                return;
            }
            if (this.ageMs >= fadeOutMs) {
                const elapsedFade = this.ageMs - fadeOutMs;
                this.alpha = Math.max(0, Math.min(1, 1 - elapsedFade / durationMs));
            } else this.alpha = 1;
        }
        if (this._fractureCooldown > 0) this._fractureCooldown--;
    }
    tickPropSubstep(dt) {
        if (this.isSleeping) return;
        applyVelocityDamping(this, dt, { friction: this.strategy.friction });
    }
}
class KineticDebrisStore {
    constructor(engine, world) {
        this.engine = engine;
        this.world = world;
        this._bodies = [];
        this._integratedScratch = [];
        this._breakSource = { id: -1, type: "", strategy: null, x: 0, y: 0, vx: 0, vy: 0, angularVelocity: 0, facing: 0, shape: undefined, chunks: undefined, footprintVertices: undefined, footprintArea: undefined, radius: 0, mass: 1, wallChunkProfileId: undefined, wallChunkHeightPx: undefined, height: undefined };
    }
    list() {
        return this._bodies;
    }
    acquireBody(type, x, y, facing = 0) {
        let body = kineticDebrisFreePool.pop();
        if (!body) {
            const row = kineticDebrisSlab.activeCount;
            if (row >= MAX_KINETIC_DEBRIS) throw new Error(`Kinetic debris slab capacity exceeded (${MAX_KINETIC_DEBRIS})`);
            kineticDebrisSlab.activeCount = row + 1;
            body = new KineticDebrisBody(this);
            body._row = row;
        }
        const row = body._row;
        kineticDebrisSlab.alpha[row] = 1;
        kineticDebrisSlab.ageMs[row] = 0;
        body._store = this;
        body.id = kineticDebrisNextId++;
        body.type = type;
        body.strategy = buildWorldPropStrategyFromAsset(propCatalog[type]);
        const asset = propCatalog[type];
        body.height = asset?.visuals?.world?.height ?? 12;
        body.visualOverride = undefined;
        body.wallChunkProfileId = undefined;
        body.wallChunkHeightPx = undefined;
        body._wallChunkTextures = undefined;
        body._wallChunkTextureReady = undefined;
        body.isDead = false;
        body.isSleeping = false;
        body.shape = undefined;
        body.collisionParts = undefined;
        body.chunks = undefined;
        body.footprintVertices = undefined;
        body.footprintArea = undefined;
        body.radius = 0;
        body.mass = 1;
        body._fractureCooldown = 0;
        body._neighbors = undefined;
        body._neighborsFrameId = -1;
        kineticDebrisSlab.x[row] = x;
        kineticDebrisSlab.y[row] = y;
        kineticDebrisSlab.vx[row] = 0;
        kineticDebrisSlab.vy[row] = 0;
        kineticDebrisSlab.w[row] = 0;
        kineticDebrisSlab.facing[row] = facing;
        normalizeKineticBody(body);
        return body;
    }
    remove(body, spatialFrame) {
        if (!spatialFrame) throw new Error("Kinetic debris removal requires spatial frame");
        if (!body?.isKineticDebris) throw new Error("Invalid kinetic debris removal");
        if (body._physId !== undefined) spatialFrame.evictKineticProp(body, this.world.kinetic);
        const index = this._bodies.indexOf(body);
        if (index < 0) throw new Error("Kinetic debris body missing from store");
        this._bodies.splice(index, 1);
        body.isDead = true;
        kineticDebrisFreePool.push(body);
    }
    spawnFromBreak(desc, spatialFrame) {
        if (!spatialFrame) throw new Error("Kinetic debris break spawn requires spatial frame");
        const propType = desc.kind === "voxel" ? "wall_voxel_chunk" : "wall_rail_chunk";
        const parent = this._breakSource;
        parent.type = propType;
        parent.strategy = buildWorldPropStrategyFromAsset(propCatalog[propType]);
        parent.x = desc.x;
        parent.y = desc.y;
        parent.vx = 0;
        parent.vy = 0;
        parent.angularVelocity = 0;
        parent.facing = desc.angle;
        parent.shape = undefined;
        parent.collisionParts = undefined;
        parent.chunks = undefined;
        parent.footprintVertices = undefined;
        parent.footprintArea = undefined;
        applyPropBoxFootprint(parent, desc.width / 2, desc.height / 2);
        parent.height = desc.wallHeight;
        parent.wallChunkProfileId = desc.wallChunkProfileId;
        parent.wallChunkHeightPx = desc.wallChunkHeightPx;
        const sourceMass = desc.sourceMass ?? 1;
        const massFactor = sourceMass / (sourceMass + parent.mass);
        const speed = Math.max(20, desc.sourceSpeed * 0.6 * (massFactor * 2));
        parent.vx = -desc.normalX * speed;
        parent.vy = -desc.normalY * speed;
        parent.angularVelocity = (deterministicUnitRandom(Math.imul(desc.idx | 0, 1597334677)) - 0.5) * 2.0;
        const sourceMotion = FractureEngine._currentPropMotion(parent);
        const force = FractureEngine.impactForceFromContact(desc.sourceSpeed, sourceMass, parent.mass ?? 1) + FRACTURE_TUNING.wallSpawn.forceBias;
        const fracture = FractureEngine.fracturePropOnImpact(parent, desc.contactX, desc.contactY, force, this.engine);
        if (!fracture) throw new Error("Wall break produced no fracture debris");
        const stores = fracture._stores ?? this.engine.stores;
        const spawned = this.spawnShardsFromFracture(parent, fracture, stores, sourceMotion);
        if (!spawned.length) {
            releaseDebrisGeomHandles(stores, fracture.debrisStart, fracture.debrisCount);
            stores.debris.reset();
            throw new Error("Wall break spawned no debris bodies");
        }
        admitKineticPropsBatch(spatialFrame, spawned, this.world);
        releaseDebrisGeomHandles(stores, fracture.debrisStart, fracture.debrisCount);
        stores.debris.reset();
        return spawned;
    }
    spawnShardsFromFracture(sourceProp, fracture, stores = moduleStores, sourceMotion = null) {
        const facing = fracture.facing;
        const cos = Math.cos(facing);
        const sin = Math.sin(facing);
        const motion = sourceMotion ?? FractureEngine._currentPropMotion(sourceProp);
        const glassBurst = !sourceProp.isKineticDebris && sourceProp.strategy?.fracture?.mode === "glass";
        const burstRandom = glassBurst ? FractureEngine._fractureRandomFromImpact(fracture.originX, fracture.originY, fracture.impactForce, 991) : null;
        const wallChunkProfileId = sourceProp.wallChunkProfileId;
        const wallChunkHeightPx = sourceProp.wallChunkHeightPx;
        const shardHeight = sourceProp.height;
        const shardType = sourceProp.type;
        const debris = stores.debris;
        const spawned = [];
        for (let i = fracture.debrisStart; i < fracture.debrisStart + fracture.debrisCount; i++) {
            const cx = debris.centroidX[i];
            const cy = debris.centroidY[i];
            const worldPos = transformPoint2DInto(fractureWorldScratchA, fracture.originX, fracture.originY, cx, cy, cos, sin);
            const body = this.acquireBody(shardType, worldPos.x, worldPos.y, facing);
            const geom = materializePolygonDebris(stores, i);
            FractureEngine.applyPropFractureGeometry(body, geom);
            stores.geom.release(debris.vertHandle[i]);
            debris.vertHandle[i] = 0;
            body.vx = motion.vx ?? 0;
            body.vy = motion.vy ?? 0;
            body.angularVelocity = motion.w ?? 0;
            body._fractureCooldown = FRACTURE_TUNING.shared.cooldown;
            if (sourceProp.faction !== undefined) body.faction = sourceProp.faction;
            if (sourceProp.visualOverride !== undefined) body.visualOverride = sourceProp.visualOverride;
            if (wallChunkProfileId !== undefined) {
                body.wallChunkProfileId = wallChunkProfileId;
                body.wallChunkHeightPx = wallChunkHeightPx;
            }
            if (shardHeight != null) body.height = shardHeight;
            if (glassBurst) FractureEngine._applyShardBurstImpulse(fracture, body, cx, cy, burstRandom);
            spawned.push(body);
        }
        for (let i = 0; i < spawned.length; i++) {
            this._bodies.push(spawned[i]);
            wakeKineticBody(spawned[i]);
        }
        return spawned;
    }
    tickFrames(dt, spatialFrame) {
        for (let i = this._bodies.length - 1; i >= 0; i--) this._bodies[i].tickPropFrame(dt, this.world, spatialFrame);
    }
    appendVisibleProps(drawQueue, viewport, drawKindProp) {
        const bounds = viewport.bounds("props");
        const minX = bounds.minX;
        const maxX = bounds.maxX;
        const minY = bounds.minY;
        const maxY = bounds.maxY;
        const vx = viewport.x;
        const vy = viewport.y;
        for (let i = 0; i < this._bodies.length; i++) {
            const body = this._bodies[i];
            if (body.isDead) throw new Error("Invalid live kinetic debris body");
            const radius = body.radius;
            if (!(radius > 0)) throw new Error("Kinetic debris missing radius");
            const x = body.x;
            const y = body.y;
            if (x + radius < minX || x - radius > maxX || y + radius < minY || y - radius > maxY) continue;
            const dx = x - vx;
            const dy = y - vy;
            drawQueue.push(drawKindProp, 0, body, dx * dx + dy * dy);
        }
    }
    integrateSpawned(spatialFrame, bodies, dtMs) {
        if (!bodies.length || dtMs <= 0) return;
        const integrated = this._integratedScratch;
        integrated.length = 0;
        for (let i = 0; i < bodies.length; i++) {
            const body = bodies[i];
            if (body.isDead || body.isSleeping) continue;
            body.tickPropSubstep(dtMs);
            integrated.push(body);
        }
        if (!integrated.length) return;
        snapshotKineticBodySlab(integrated);
        spatialFrame.reindexKineticBodies(integrated);
        integrated.length = 0;
    }
}
const railWallEndpointA = { x: 0, y: 0 };
const railWallEndpointB = { x: 0, y: 0 };
const fractureWorldScratchA = { x: 0, y: 0 };
const fractureWorldScratchB = { x: 0, y: 0 };
export function computeWallBreakStrength(preSpeed, approachDot, config) {
    if (preSpeed < config.minStrikeSpeed || approachDot >= 0) return 0;
    const speedSpan = config.referenceMaxSpeed - config.minStrikeSpeed;
    const speedT = speedSpan <= 0 ? 1 : Math.min(1, Math.max(0, (preSpeed - config.minStrikeSpeed) / speedSpan));
    const angleT = Math.min(1, -approachDot / preSpeed);
    return speedT * angleT;
}
export function wallDamageKey(target) {
    return target.kind === "voxel" ? `v:${target.idx}` : `r:${target.idx}:${target.side}`;
}
export function resolveWallDamageTarget(grid, segment) {
    if (!segment) return null;
    const idx = segment.gridIdx;
    if (idx < 0 || idx >= grid.grid.length) return null;
    if (segment.isStaticGridProxy && cellIsStaticWall(grid, idx)) return { kind: "voxel", idx };
    if (segment.isEdgeRail) {
        const side = segment.gridSide;
        if (side == null) return null;
        const edge = grid.getCellEdge(idx, side);
        if (!isRailWallEdge(edge)) return null;
        return { kind: "rail", idx, side };
    }
    return null;
}
export function createGridWallDamage(state, config) {
    return { config, pendingBreaks: new Map(), commit: createDeferredGridWallCommit(state), spatialFrame: null };
}
export function resolveKineticWallDamage(state, entity, spatialFrame, wallResolver) {
    const wallDamage = state.gridWallDamage;
    const preSpeed = Math.hypot(entity.vx ?? 0, entity.vy ?? 0);
    const shouldBreakWallHit = wallDamage && preSpeed > 0 ? (hit) => computeWallBreakStrength(preSpeed, hit.approachDot, wallDamage.config) >= wallDamage.config.minBreakStrength : null;
    const result = wallResolver.resolve(entity, spatialFrame, shouldBreakWallHit);
    if (!wallDamage) return result.collided;
    if (!result.hits.length) return result.collided;
    wallDamage.spatialFrame = spatialFrame;
    queueWallHits(wallDamage, state.obstacleGrid, result.hits, preSpeed, entity);
    return result.collided;
}
function targetToSegment(target) {
    if (target.kind === "voxel") return { gridIdx: target.idx, isStaticGridProxy: true, isEdgeRail: false };
    return { gridIdx: target.idx, gridSide: target.side, isEdgeRail: true, isStaticGridProxy: false };
}
export function queueWallHits(wallDamage, grid, hits, preSpeed, entity = null) {
    const config = wallDamage.config;
    for (let i = 0; i < hits.length; i++) {
        const hit = hits[i];
        const target = resolveWallDamageTarget(grid, hit.segment);
        if (!target) continue;
        const strength = computeWallBreakStrength(preSpeed, hit.approachDot, config);
        if (strength < config.minBreakStrength) continue;
        const key = wallDamageKey(target);
        if (!wallDamage.pendingBreaks.has(key)) {
            const cx = hit.contactX ?? (hit.segment ? hit.segment.x : null) ?? grid.gridCenterXByIdx(target.idx);
            const cy = hit.contactY ?? (hit.segment ? hit.segment.y : null) ?? grid.gridCenterYByIdx(target.idx);
            wallDamage.pendingBreaks.set(key, { target, strength, hit, contactX: cx, contactY: cy, normalX: hit.normalX ?? 0, normalY: hit.normalY ?? 0, sourceSpeed: preSpeed, sourceMass: entity ? (entity.mass ?? 1) : 1 });
        }
    }
}
export function applyPendingWallDamage(state, wallDamage = state.gridWallDamage) {
    if (!wallDamage?.pendingBreaks.size) return null;
    const grid = state.obstacleGrid;
    const descriptors = [];
    for (const item of wallDamage.pendingBreaks.values()) {
        const target = item.target;
        if (!resolveWallDamageTarget(grid, targetToSegment(target))) continue;
        const idx = target.idx;
        if (target.kind === "voxel") {
            const info = getVoxelWallInfo(grid, idx);
            if (info == null) continue;
            const cx = grid.gridCenterXByIdx(idx);
            const cy = grid.gridCenterYByIdx(idx);
            const cellsPerChunk = state.worldSurfaces.settings.cellsPerChunk;
            const profileId = resolveCellSurfaceProfileId(grid, idx, state.worldSurfaces.activeSurfaceProfileId, cellsPerChunk);
            const wallHeightPx = grid.grid[idx] * grid.cellSize;
            descriptors.push({ kind: "voxel", idx: idx, x: cx, y: cy, angle: 0, width: grid.cellSize, height: grid.cellSize, wallHeight: wallHeightPx, wallChunkProfileId: profileId, wallChunkHeightPx: wallHeightPx, strength: item.strength, contactX: item.contactX ?? cx, contactY: item.contactY ?? cy, normalX: item.normalX, normalY: item.normalY, sourceSpeed: item.sourceSpeed, sourceMass: item.sourceMass ?? 1 });
        } else {
            const info = getRailWallInfo(grid, idx, target.side);
            if (!info) continue;
            cellEdgeEndpointsIdx(grid, idx, target.side, railWallEndpointA, railWallEndpointB, 0);
            const cx = (railWallEndpointA.x + railWallEndpointB.x) * 0.5;
            const cy = (railWallEndpointA.y + railWallEndpointB.y) * 0.5;
            const angle = Math.atan2(railWallEndpointB.y - railWallEndpointA.y, railWallEndpointB.x - railWallEndpointA.x);
            const cellsPerChunk = state.worldSurfaces.settings.cellsPerChunk;
            const profileId = resolveEdgeSurfaceProfileId(grid, idx, target.side, state.worldSurfaces.activeSurfaceProfileId, cellsPerChunk);
            const wallHeightPx = info.heightLevel * grid.cellSize;
            descriptors.push({ kind: "rail", idx: idx, side: target.side, x: cx, y: cy, angle: angle, width: grid.cellSize, height: info.thicknessLevel ?? 1, wallHeight: wallHeightPx, wallChunkProfileId: profileId, wallChunkHeightPx: wallHeightPx, strength: item.strength, contactX: item.contactX ?? cx, contactY: item.contactY ?? cy, normalX: item.normalX, normalY: item.normalY, sourceSpeed: item.sourceSpeed, sourceMass: item.sourceMass ?? 1 });
        }
    }
    wallDamage.pendingBreaks.clear();
    const voxels = [];
    const railBatch = new RailWallBatch(Math.max(1, descriptors.length));
    for (const desc of descriptors)
        if (desc.kind === "voxel") voxels.push(desc.idx);
        else railBatch.add(desc.idx, desc.side, 1, 1);
    let commitBounds = null;
    if (voxels.length || railBatch.count) {
        wallDamage.commit.clearWalls({ voxels, rails: railBatch });
        commitBounds = wallDamage.commit.flush();
    }
    const spatialFrame = wallDamage.spatialFrame ?? null;
    wallDamage.spatialFrame = null;
    const spawned = [];
    for (const desc of descriptors) {
        const shards = state.fractureEngine.debris.spawnFromBreak(desc, spatialFrame);
        for (let i = 0; i < shards.length; i++) spawned.push(shards[i]);
    }
    if (!spawned.length && !commitBounds) return null;
    return { commitBounds, spawned };
}
export class FractureEngine {
    constructor(world) {
        this.world = world;
        this.debris = new KineticDebrisStore(this, world);
        this.deferredFractures = [];
        this.deferredFracturesCount = 0;
        const geom = new FractureGeomPool();
        this.stores = { geom, debris: new FractureDebrisStore(geom) };
    }
    processKineticContactFractures(tick, contacts) {
        if (contacts.count === 0) return;
        const slab = kineticDynamicSlab;
        for (let i = 0; i < contacts.count; i++) {
            const physIdA = contacts.physIdA[i];
            const physIdB = contacts.physIdB[i];
            const bodyA = tick.frame.entityGrid.entities[physIdA]?._physId === physIdA ? tick.frame.entityGrid.entities[physIdA] : null;
            const bodyB = tick.frame.entityGrid.entities[physIdB]?._physId === physIdB ? tick.frame.entityGrid.entities[physIdB] : null;
            if (!bodyA || !bodyB) continue;
            const nx = contacts.dynamic.nx[i];
            const ny = contacts.dynamic.ny[i];
            let hitX;
            let hitY;
            if (contacts.static.tier[i] === KINETIC_PAIR_TIER.CIRCLE_CIRCLE) {
                hitX = slab.x[physIdA] - nx * slab.r[physIdA];
                hitY = slab.y[physIdA] - ny * slab.r[physIdA];
            } else {
                hitX = slab.x[physIdA] + contacts.dynamic.rax[i];
                hitY = slab.y[physIdA] + contacts.dynamic.ray[i];
            }
            const relSpeed = Math.hypot(contacts.dynamic.preDvx[i], contacts.dynamic.preDvy[i]);
            const force = FractureEngine.impactForceFromContact(relSpeed, bodyA.mass, bodyB.mass);
            this.queueFractureKineticContact(bodyA, bodyB, hitX, hitY, force, nx, ny);
        }
        this.flushDeferredFractures(tick.world, tick.frame);
    }
    flushDeferredFractures(world, spatialFrame) {
        const count = this.deferredFracturesCount;
        if (count === 0) return;
        world.entityRegistry.beginMembershipBatch();
        const propsToAdmit = [];
        const deferredFractures = this.deferredFractures;
        const stores = this.stores;
        try {
            for (let i = 0; i < count; i++) {
                const item = deferredFractures[i];
                const prop = item.prop;
                delete prop._pendingEviction;
                const sourceMotion = FractureEngine._currentPropMotion(prop);
                if (prop.isKineticDebris) this.debris.remove(prop, spatialFrame);
                else removeWorldPropFromState(world, prop, spatialFrame);
                const shards = this.debris.spawnShardsFromFracture(prop, item, stores, sourceMotion);
                for (let j = 0; j < shards.length; j++) propsToAdmit.push(shards[j]);
                releaseDebrisGeomHandles(stores, item.debrisStart, item.debrisCount);
                item.prop = null;
            }
            admitKineticPropsBatch(spatialFrame, propsToAdmit, world);
        } finally {
            world.entityRegistry.endMembershipBatch();
            stores.debris.reset();
            this.deferredFracturesCount = 0;
        }
    }
    queueFractureKineticContact(bodyA, bodyB, hitX, hitY, force, nx = 0, ny = 0) {
        for (let i = 0; i < 2; i++) {
            const prop = i === 0 ? bodyA : bodyB;
            const other = i === 0 ? bodyB : bodyA;
            if (prop._physId === undefined) continue;
            const fractureConfig = prop.strategy?.fracture;
            if (!fractureConfig) continue;
            const minForce = fractureConfig.minForce ?? GLASS_FRACTURE_IMPACT_THRESHOLD;
            if (force < minForce) continue;
            if (!FractureEngine.canFracturePropSplit(prop)) continue;
            if (prop._fractureCooldown > 0) continue;
            if (other.strategy?.fracture?.mode === "glass") continue;
            if (prop._pendingEviction) continue;
            const fracture = FractureEngine.fracturePropOnImpact(prop, hitX, hitY, force, this);
            if (!fracture) continue;
            prop._pendingEviction = true;
            this.enqueueDeferredFracture(prop, fracture);
            // One contact -> at most one fracture event (avoid double-spawn cascades).
            return;
        }
    }
    enqueueDeferredFracture(prop, fracture) {
        const deferredFractures = this.deferredFractures;
        let count = this.deferredFracturesCount;
        let item = deferredFractures[count];
        if (!item) {
            item = { prop: null, debrisStart: 0, debrisCount: 0, originX: 0, originY: 0, impactLocalX: 0, impactLocalY: 0, impactForce: 0, facing: 0 };
            deferredFractures[count] = item;
        }
        item.prop = prop;
        item.debrisStart = fracture.debrisStart;
        item.debrisCount = fracture.debrisCount;
        item.originX = fracture.originX;
        item.originY = fracture.originY;
        item.impactLocalX = fracture.impactLocalX;
        item.impactLocalY = fracture.impactLocalY;
        item.impactForce = fracture.impactForce;
        item.facing = fracture.facing;
        this.deferredFracturesCount = count + 1;
    }
    static commitFractureResult(world, prop, fracture, spatialFrame) {
        if (!spatialFrame) throw new Error("commitFractureResult requires spatial frame");
        const sourceMotion = FractureEngine._currentPropMotion(prop);
        if (prop.isKineticDebris) world.fractureEngine.debris.remove(prop, spatialFrame);
        else removeWorldPropFromState(world, prop, spatialFrame);
        const stores = fracture._stores ?? world.fractureEngine.stores;
        const shards = world.fractureEngine.debris.spawnShardsFromFracture(prop, fracture, stores, sourceMotion);
        admitKineticPropsBatch(spatialFrame, shards, world);
        releaseDebrisGeomHandles(stores, fracture.debrisStart, fracture.debrisCount);
        stores.debris.reset();
        return shards;
    }
    static materializeDebrisGeometries(stores, debrisStart, debrisCount) {
        const geometries = [];
        for (let i = debrisStart; i < debrisStart + debrisCount; i++) geometries.push(materializePolygonDebris(stores, i));
        return geometries;
    }
    static fracturePropOnImpact(prop, worldHitX, worldHitY, impactForce, engine = null) {
        const stores = engine?.stores ?? moduleStores;
        if (!engine || engine.deferredFracturesCount === 0) stores.debris.reset();
        if (prop.strategy?.fracture?.mode !== "glass") return null;
        return FractureEngine._fractureGlassOnImpact(prop, worldHitX, worldHitY, impactForce, stores);
    }
    static impactForceFromContact(relativeSpeed, massA = 1, massB = 1) {
        return relativeSpeed * 0.5 + Math.sqrt(massA * massB) * 0.3;
    }
    static worldHitToPropLocal(prop, worldX, worldY) {
        const origin = FractureEngine._propWorldPosition(prop);
        const dx = worldX - origin.x;
        const dy = worldY - origin.y;
        const cos = Math.cos(entityFacing(prop));
        const sin = Math.sin(entityFacing(prop));
        return { x: dx * cos + dy * sin, y: -dx * sin + dy * cos };
    }
    static applyPropFractureGeometry(prop, geometry) {
        prop.chunks = undefined;
        prop.collisionParts = undefined;
        prop.footprintVertices = geometry.footprintVertices;
        prop.footprintArea = geometry.footprintArea;
        prop.radius = geometry.boundingRadius;
        prop.shape = new PolygonShape(geometry.footprintVertices);
        markBroadphaseDirty(prop);
        prop.mass = kineticMassFromFootprint(prop);
        normalizeKineticBody(prop);
    }
    static canFracturePropSplit(prop, minSize = FRACTURE_MIN_PIECE_SIZE) {
        if (!prop?.strategy?.fracture) return false;
        const shape = prop.shape;
        if (shape?.type !== "Polygon") return false;
        const { x, y } = convexFootprintHalfExtents(shape.vertices);
        if (Math.max(x, y) * 2 < minSize) return false;
        const minArea = FractureEngine.minShardAreaForPolygon(shape.vertices) * 2;
        return FractureEngine._glassFootprintArea(prop) >= minArea;
    }
    static shatterGlassFootprint(hx, hy, hitX, hitY, impactForce = 10, random = Math.random) {
        const flat = boxLocalFootprint(hx, hy);
        return FractureEngine.shatterGlassPolygon(flat, hitX, hitY, impactForce, random);
    }
    static shatterGlassPolygon(flatVerts, hitX, hitY, impactForce = 10, random = Math.random, stores = moduleStores) {
        if (flatVerts.length < 6) return [];
        stores.debris.reset();
        const result = FractureEngine._shatterPolygonIntoStore(stores, flatVerts, hitX, hitY, impactForce, random);
        if (result.debrisCount < 2) {
            stores.debris.reset();
            return [];
        }
        const geometries = FractureEngine.materializeDebrisGeometries(stores, result.debrisStart, result.debrisCount);
        releaseDebrisGeomHandles(stores, result.debrisStart, result.debrisCount);
        stores.debris.reset();
        return geometries;
    }
    static _shatterPolygonIntoStore(stores, flatVerts, hitX, hitY, impactForce, random) {
        const seedCount = FractureEngine._seedCountForPolygon(flatVerts, impactForce);
        FractureEngine._buildShatterSeeds(flatVerts, hitX, hitY, seedCount, random, SHATTER_SEEDS);
        const vertCount = flatVerts.length / 2;
        const debrisStart = stores.debris.write;
        for (let i = 0; i < seedCount; i++) {
            const cell = stores.geom.voronoiCell(flatVerts, vertCount, SHATTER_SEEDS, i, seedCount);
            if (cell.vertCount < 3) {
                if (cell.handle) stores.geom.release(cell.handle);
                continue;
            }
            stores.debris.appendCenteredPolygon(cell.handle, cell.vertCount);
        }
        return { debrisStart, debrisCount: stores.debris.write - debrisStart };
    }
    static _buildShatterSeeds(flatVerts, hitX, hitY, seedCount, random, outSeeds) {
        const { cx, cy } = polygonCentroid2D(flatVerts);
        let ox = hitX;
        let oy = hitY;
        if (!pointInPolygon(ox, oy, flatVerts)) {
            const edge = FractureEngine._closestPointOnPolygonBoundary(ox, oy, flatVerts);
            ox = edge.x + (cx - edge.x) * 0.15;
            oy = edge.y + (cy - edge.y) * 0.15;
        }
        const span = FractureEngine._polygonSpan(flatVerts);
        const golden = 2.399963229728653;
        outSeeds.length = 0;
        outSeeds.push(ox, oy);
        for (let i = 1; i < seedCount; i++) {
            const r = span * 0.62 * Math.sqrt(i / seedCount) * (0.85 + 0.3 * random());
            const a = i * golden + (random() - 0.5) * 0.5;
            outSeeds.push(ox + Math.cos(a) * r, oy + Math.sin(a) * r);
        }
    }
    static _seedCountForPolygon(flatVerts, impactForce) {
        const area = Math.abs(polygonSignedArea2D(flatVerts));
        const span = FractureEngine._polygonSpan(flatVerts);
        const minArea = FractureEngine.minShardAreaForPolygon(flatVerts);
        const areaCap = Math.max(2, Math.floor(area / minArea));
        const minShardsAllowed = Math.min(4, areaCap);
        let count = Math.max(minShardsAllowed, Math.min(GLASS_MAX_SHARDS_PER_SHATTER, Math.round(span / 12) + Math.floor(impactForce * 0.03)));
        return Math.min(count, areaCap);
    }
    static measureGlassShard(flatVerts) {
        let minX = Infinity;
        let maxX = -Infinity;
        let minY = Infinity;
        let maxY = -Infinity;
        const count = flatVerts.length / 2;
        for (let i = 0; i < count; i++) {
            const x = flatVerts[i * 2];
            const y = flatVerts[i * 2 + 1];
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
        }
        const thick = Math.max(maxX - minX, maxY - minY);
        const thin = Math.min(maxX - minX, maxY - minY);
        return { area: Math.abs(polygonSignedArea2D(flatVerts)), thin, thick, aspect: thick / Math.max(1e-6, thin) };
    }
    static minShardAreaForPolygon(flatVerts) {
        const area = Math.abs(polygonSignedArea2D(flatVerts));
        return Math.max(GLASS_MIN_SHARD_AREA, area / GLASS_MAX_SHARDS_PER_SHATTER);
    }
    static _fractureRandomFromImpact(worldHitX, worldHitY, impactForce, salt = 0) {
        let call = 0;
        const base = Math.imul(Math.floor(worldHitX * 1000), 73856093) ^ Math.imul(Math.floor(worldHitY * 1000), 19349663) ^ Math.imul(Math.floor(impactForce * 100), 83492791) ^ salt;
        return () => deterministicUnitRandom(base ^ Math.imul(++call, 2654435761));
    }
    static _polygonSpan(flatVerts) {
        return Math.sqrt(Math.abs(polygonSignedArea2D(flatVerts)));
    }
    static _closestPointOnPolygonBoundary(x, y, flatVerts) {
        let bestX = flatVerts[0];
        let bestY = flatVerts[1];
        let bestDistSq = Infinity;
        const count = flatVerts.length / 2;
        for (let i = 0; i < count; i++) {
            const j = (i + 1) % count;
            const ax = flatVerts[i * 2];
            const ay = flatVerts[i * 2 + 1];
            const bx = flatVerts[j * 2];
            const by = flatVerts[j * 2 + 1];
            const closest = closestPointOnLineSegment(x, y, ax, ay, bx, by);
            const distSq = (x - closest.x) * (x - closest.x) + (y - closest.y) * (y - closest.y);
            if (distSq < bestDistSq) {
                bestDistSq = distSq;
                bestX = closest.x;
                bestY = closest.y;
            }
        }
        return { x: bestX, y: bestY, dist: Math.sqrt(bestDistSq) };
    }
    static _glassFootprintArea(prop) {
        if (prop.footprintArea != null) return prop.footprintArea;
        const shape = prop.shape;
        if (shape?.type === "Polygon") return Math.abs(polygonSignedArea2D(shape.vertices));
        return 0;
    }
    static _propWorldPosition(prop) {
        const physId = prop._physId;
        return { x: physId !== undefined ? kineticDynamicSlab.x[physId] : prop.x, y: physId !== undefined ? kineticDynamicSlab.y[physId] : prop.y };
    }
    static _currentPropMotion(prop) {
        if (prop.isKineticDebris && prop._row >= 0) {
            const row = prop._row;
            return { vx: kineticDebrisSlab.vx[row], vy: kineticDebrisSlab.vy[row], w: kineticDebrisSlab.w[row] };
        }
        const physId = prop._physId;
        if (physId !== undefined) return { vx: kineticDynamicSlab.vx[physId], vy: kineticDynamicSlab.vy[physId], w: kineticDynamicSlab.w[physId] };
        return { vx: prop.vx ?? 0, vy: prop.vy ?? 0, w: prop.angularVelocity ?? 0 };
    }
    static _applyShardBurstImpulse(fracture, frag, cx, cy, random) {
        const cos = Math.cos(fracture.facing);
        const sin = Math.sin(fracture.facing);
        const impactWorld = transformPoint2DInto(fractureWorldScratchA, fracture.originX, fracture.originY, fracture.impactLocalX, fracture.impactLocalY, cos, sin);
        const burst = Math.min(FRACTURE_TUNING.burst.maxBurst, FRACTURE_TUNING.burst.baseBurst + fracture.impactForce * FRACTURE_TUNING.burst.burstForceScale);
        const worldPos = transformPoint2DInto(fractureWorldScratchB, fracture.originX, fracture.originY, cx, cy, cos, sin);
        const dx = worldPos.x - impactWorld.x;
        const dy = worldPos.y - impactWorld.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 1e-6) {
            frag.vx += (dx / dist) * burst;
            frag.vy += (dy / dist) * burst;
        }
        frag.angularVelocity += (random() - 0.5) * FRACTURE_TUNING.burst.spinScale;
        frag._fractureCooldown = FRACTURE_TUNING.shared.cooldown;
    }
    static _fractureGlassOnImpact(prop, worldHitX, worldHitY, impactForce, stores) {
        if (!FractureEngine.canFracturePropSplit(prop)) return null;
        const origin = FractureEngine._propWorldPosition(prop);
        const impactLocal = FractureEngine.worldHitToPropLocal(prop, worldHitX, worldHitY);
        const flatVerts = prop.shape.vertices;
        const random = FractureEngine._fractureRandomFromImpact(worldHitX, worldHitY, impactForce);
        const result = FractureEngine._shatterPolygonIntoStore(stores, flatVerts, impactLocal.x, impactLocal.y, impactForce, random);
        if (result.debrisCount < 2) return null;
        return { debrisStart: result.debrisStart, debrisCount: result.debrisCount, originX: origin.x, originY: origin.y, facing: entityFacing(prop), impactLocalX: impactLocal.x, impactLocalY: impactLocal.y, impactForce, _stores: stores };
    }
}
