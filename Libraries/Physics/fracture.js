import { removeWorldPropFromState, addWorldPropsToState } from "../../GameState/EntityRegistry.js";
import propCatalog from "../../Assets/props/index.js";
import { entityFacing, wakeKineticBody, kineticDynamicSlab, KINETIC_PAIR_TIER, pruneKineticConstraintsForBody, PolygonShape, markBroadphaseDirty, kineticMassFromFootprint, applyVelocityDamping, snapshotKineticBodySlab } from "./physics.js";
import { transformPoint2DInto, boxLocalFootprint, convexFootprintHalfExtents, polygonCentroid2D, pointInPolygon, polygonSignedArea2D, closestPointOnLineSegment, deterministicUnitRandom } from "../Math/math.js";
import { WorldProp, applyPropBoxFootprint, buildWorldPropStrategyFromAsset } from "../Props/props.js";
// ===== FRACTURE ENGINE =====
export const FRACTURE_TUNING = { shared: { impactThreshold: 12, minPieceSize: 5, cooldown: 8 }, glass: { impactThreshold: 6, minShardArea: 12, maxShardsPerShatter: 18, maxSliverAspect: 10, minWedgeAngle: Math.PI / 12 }, chunk: { minCell: 8, maxCellsPerAxis: 6, damageRadiusScale: 0.05, neighborRollHighForceThreshold: 12, neighborRollHighForceDivisor: 30, neighborRollLowForceBase: 0.1, neighborRollLowForceScale: 0.04, rectMergeEps: 1e-3 }, wallSpawn: { forceBias: 10 }, burst: { maxBurst: 35, baseBurst: 8, burstForceScale: 0.12, spinScale: 0.4 } };
export const CHUNK_MIN_CELL = FRACTURE_TUNING.chunk.minCell;
export const CHUNK_MAX_CELLS_PER_AXIS = FRACTURE_TUNING.chunk.maxCellsPerAxis;
export const GLASS_FRACTURE_IMPACT_THRESHOLD = FRACTURE_TUNING.glass.impactThreshold;
export const GLASS_MIN_SHARD_AREA = FRACTURE_TUNING.glass.minShardArea;
export const GLASS_MAX_SHARDS_PER_SHATTER = FRACTURE_TUNING.glass.maxShardsPerShatter;
export const GLASS_MAX_SLIVER_ASPECT = FRACTURE_TUNING.glass.maxSliverAspect;
export const GLASS_MIN_WEDGE_ANGLE = FRACTURE_TUNING.glass.minWedgeAngle;
export const GLASS_FRACTURE_COOLDOWN_STEPS = FRACTURE_TUNING.shared.cooldown;
export const FRACTURE_MIN_PIECE_SIZE = FRACTURE_TUNING.shared.minPieceSize;
export const FRACTURE_IMPACT_THRESHOLD = FRACTURE_TUNING.shared.impactThreshold;
const SHARED_CENTROID = { cx: 0, cy: 0, signedArea: 0 };
const GEOM_VERT_BUCKETS = [8, 16, 32, 64, 128, 256, 512];
const MAX_FRACTURE_DEBRIS = FRACTURE_TUNING.burst.maxBurst;
const MAX_CHUNK_CELLS = CHUNK_MAX_CELLS_PER_AXIS * CHUNK_MAX_CELLS_PER_AXIS;
const MAX_CLIP_VERTS = 512;
const MAX_WALL_DEBRIS = 2048;
const wallDebrisSlab = { activeCount: 0, x: new Float32Array(MAX_WALL_DEBRIS), y: new Float32Array(MAX_WALL_DEBRIS), vx: new Float32Array(MAX_WALL_DEBRIS), vy: new Float32Array(MAX_WALL_DEBRIS), w: new Float32Array(MAX_WALL_DEBRIS), facing: new Float32Array(MAX_WALL_DEBRIS), ageMs: new Float32Array(MAX_WALL_DEBRIS), alpha: new Float32Array(MAX_WALL_DEBRIS) };
const wallDebrisFreeStack = [];
const wallDebrisBodiesByRow = new Array(MAX_WALL_DEBRIS);
let wallDebrisNextId = 0x50000000;
function isWallChunkPropType(type) {
    return type === "wall_voxel_chunk" || type === "wall_rail_chunk";
}
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
        let buffer = this.buckets[bucket].pop();
        if (!buffer || buffer.length < capacity) buffer = new Float32Array(capacity);
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
    wedgeClip(flatVerts, vertCount, apexX, apexY, angle0, angle1) {
        const nx0 = -Math.sin(angle0);
        const ny0 = Math.cos(angle0);
        const nx1 = Math.sin(angle1);
        const ny1 = -Math.cos(angle1);
        let count = vertCount;
        for (let i = 0; i < count; i++) {
            this.clipA[i * 2] = flatVerts[i * 2];
            this.clipA[i * 2 + 1] = flatVerts[i * 2 + 1];
        }
        count = this.clipHalfPlaneInPlace(this.clipA, count, apexX, apexY, nx0, ny0, this.clipB);
        if (count === 0) return { handle: 0, vertCount: 0 };
        count = this.clipHalfPlaneInPlace(this.clipB, count, apexX, apexY, nx1, ny1, this.clipA);
        if (count < 3) return { handle: 0, vertCount: 0 };
        const handle = this.borrow(count);
        this.copyVerts(handle, this.clipA, count);
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
        this.chunkRunStart = new Uint16Array(MAX_FRACTURE_DEBRIS);
        this.chunkRunCount = new Uint16Array(MAX_FRACTURE_DEBRIS);
        this.hasChunkRun = new Uint8Array(MAX_FRACTURE_DEBRIS);
        this.chunkRunFlat = new Uint8Array(MAX_FRACTURE_DEBRIS * MAX_CHUNK_CELLS);
        this.chunkGeometry = [];
    }
    reset() {
        this.write = 0;
        this.chunkGeometry.length = 0;
        this.hasChunkRun.fill(0);
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
        this.hasChunkRun[i] = 0;
        return i;
    }
    appendChunkGeometry(geometry, worldCentroidX, worldCentroidY) {
        if (this.write >= MAX_FRACTURE_DEBRIS) throw new Error("FractureDebrisStore capacity exceeded");
        const i = this.write++;
        this.vertHandle[i] = 0;
        this.vertCount[i] = 0;
        this.centroidX[i] = worldCentroidX + geometry.centroid.cx;
        this.centroidY[i] = worldCentroidY + geometry.centroid.cy;
        this.footprintArea[i] = geometry.footprintArea;
        this.boundingRadius[i] = geometry.boundingRadius;
        this.hasChunkRun[i] = 2;
        this.chunkGeometry[i] = geometry;
        return i;
    }
    totalArea(start, count) {
        let total = 0;
        for (let i = start; i < start + count; i++) total += this.footprintArea[i];
        return total;
    }
}
class FractureChunkGrid {
    constructor(geomPool) {
        this.geomPool = geomPool;
        this.count = 0;
        this.rectX0 = new Float32Array(MAX_CHUNK_CELLS);
        this.rectY0 = new Float32Array(MAX_CHUNK_CELLS);
        this.rectX1 = new Float32Array(MAX_CHUNK_CELLS);
        this.rectY1 = new Float32Array(MAX_CHUNK_CELLS);
        this.centroidX = new Float32Array(MAX_CHUNK_CELLS);
        this.centroidY = new Float32Array(MAX_CHUNK_CELLS);
        this.neighborOffset = new Uint8Array(MAX_CHUNK_CELLS + 1);
        this.neighborFlat = new Uint8Array(MAX_CHUNK_CELLS * 4);
        this.componentFlat = new Uint8Array(MAX_CHUNK_CELLS);
        this.componentWrite = 0;
    }
    reset() {
        this.count = 0;
        this.componentWrite = 0;
    }
    fillRectGrid(hx, hy, cellSize) {
        this.reset();
        const cols = Math.max(1, Math.round((hx * 2) / cellSize));
        const rows = Math.max(1, Math.round((hy * 2) / cellSize));
        const cellW = (hx * 2) / cols;
        const cellH = (hy * 2) / rows;
        for (let row = 0; row < rows; row++)
            for (let col = 0; col < cols; col++) {
                const x0 = -hx + col * cellW;
                const y0 = -hy + row * cellH;
                const i = this.count++;
                this.rectX0[i] = x0;
                this.rectY0[i] = y0;
                this.rectX1[i] = x0 + cellW;
                this.rectY1[i] = y0 + cellH;
                this.centroidX[i] = (x0 + x0 + cellW) * 0.5;
                this.centroidY[i] = (y0 + y0 + cellH) * 0.5;
            }
    }
    _hashV(x, y) {
        return (Math.imul(Math.round(x * 10000), 73856093) ^ Math.imul(Math.round(y * 10000), 19349663)) & 0xffff;
    }
    _edgeKey(ha, hb) {
        return ha < hb ? (ha << 16) | (hb & 0xffff) : (hb << 16) | (ha & 0xffff);
    }
    buildAdjacency() {
        const n = this.count;
        this.neighborOffset.fill(0, 0, n + 1);
        const edgeMap = new Map();
        for (let i = 0; i < n; i++) {
            const x0 = this.rectX0[i];
            const y0 = this.rectY0[i];
            const x1 = this.rectX1[i];
            const y1 = this.rectY1[i];
            const corners = [
                [x0, y0],
                [x1, y0],
                [x1, y1],
                [x0, y1],
            ];
            for (let j = 0; j < 4; j++) {
                const k = (j + 1) % 4;
                const ha = this._hashV(corners[j][0], corners[j][1]);
                const hb = this._hashV(corners[k][0], corners[k][1]);
                const edgeKey = this._edgeKey(ha, hb);
                const edge = edgeMap.get(edgeKey);
                if (!edge) edgeMap.set(edgeKey, [i]);
                else edge.push(i);
            }
        }
        let flatWrite = 0;
        for (let i = 0; i < n; i++) this.neighborOffset[i] = flatWrite;
        for (let i = 0; i < n; i++) {
            const seen = new Uint8Array(n);
            let localCount = 0;
            for (const indices of edgeMap.values()) {
                if (indices.length !== 2) continue;
                const a = indices[0];
                const b = indices[1];
                if (a === i && !seen[b]) {
                    seen[b] = 1;
                    this.neighborFlat[flatWrite + localCount] = b;
                    localCount++;
                } else if (b === i && !seen[a]) {
                    seen[a] = 1;
                    this.neighborFlat[flatWrite + localCount] = a;
                    localCount++;
                }
            }
            flatWrite += localCount;
        }
        this.neighborOffset[n] = flatWrite;
    }
    neighborCount(cellIndex) {
        return this.neighborOffset[cellIndex + 1] - this.neighborOffset[cellIndex];
    }
    neighborAt(cellIndex, localNeighborIndex) {
        return this.neighborFlat[this.neighborOffset[cellIndex] + localNeighborIndex];
    }
    rectVertsHandle(cellIndex) {
        const handle = this.geomPool.borrow(4);
        const buf = this.geomPool.buffer(handle);
        const x0 = this.rectX0[cellIndex];
        const y0 = this.rectY0[cellIndex];
        const x1 = this.rectX1[cellIndex];
        const y1 = this.rectY1[cellIndex];
        buf[0] = x0;
        buf[1] = y0;
        buf[2] = x1;
        buf[3] = y0;
        buf[4] = x1;
        buf[5] = y1;
        buf[6] = x0;
        buf[7] = y1;
        return handle;
    }
    materializeChunks() {
        this.buildAdjacency();
        const chunks = [];
        for (let i = 0; i < this.count; i++) {
            const handle = this.rectVertsHandle(i);
            const neighbors = [];
            const nCount = this.neighborCount(i);
            for (let j = 0; j < nCount; j++) neighbors.push(this.neighborAt(i, j));
            chunks.push({ id: i, vertices: this.geomPool.footprintSlice(handle, 4), neighbors, cx: this.centroidX[i], cy: this.centroidY[i], _geomHandle: handle });
        }
        return chunks;
    }
    partsFromCellIndices(indices, count) {
        const parts = [];
        for (let i = 0; i < count; i++) {
            const cellIndex = indices[i];
            const handle = this.rectVertsHandle(cellIndex);
            parts.push({ vertices: this.geomPool.footprintSlice(handle, 4), _geomHandle: handle });
        }
        return parts;
    }
}
const moduleStores = { geom: new FractureGeomPool(), debris: new FractureDebrisStore(new FractureGeomPool()), chunkGrid: new FractureChunkGrid(new FractureGeomPool()) };
moduleStores.debris.geomPool = moduleStores.geom;
moduleStores.chunkGrid.geomPool = moduleStores.geom;
function fractureStoresFor(engine) {
    return engine?.stores ?? moduleStores;
}
const shardPools = new Map();
function admitKineticPropsBatch(spatialFrame, props, world) {
    if (!props.length) return;
    if (spatialFrame?.admitKineticProps) spatialFrame.admitKineticProps(props, world);
    else if (spatialFrame?.admitKineticProp) for (let j = 0; j < props.length; j++) spatialFrame.admitKineticProp(props[j], world);
    else throw new Error("Kinetic shard admission requires spatial frame");
}
function makeFractureDescriptor(stores, { debrisStart, debrisCount, originX, originY, facing, impactLocalX, impactLocalY, impactForce }) {
    return { debrisStart, debrisCount, originX, originY, facing, impactLocalX, impactLocalY, impactForce, _stores: stores };
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
    for (let i = start; i < start + count; i++) if (debris.hasChunkRun[i] === 0 && debris.vertHandle[i]) stores.geom.release(debris.vertHandle[i]);
}
class WallDebrisBody {
    constructor(store) {
        this.isWallDebris = true;
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
        return wallDebrisSlab.x[this._row];
    }
    set x(v) {
        wallDebrisSlab.x[this._row] = v;
    }
    get y() {
        return wallDebrisSlab.y[this._row];
    }
    set y(v) {
        wallDebrisSlab.y[this._row] = v;
    }
    get vx() {
        return wallDebrisSlab.vx[this._row];
    }
    set vx(v) {
        wallDebrisSlab.vx[this._row] = v;
    }
    get vy() {
        return wallDebrisSlab.vy[this._row];
    }
    set vy(v) {
        wallDebrisSlab.vy[this._row] = v;
    }
    get angularVelocity() {
        return wallDebrisSlab.w[this._row];
    }
    set angularVelocity(v) {
        wallDebrisSlab.w[this._row] = v;
    }
    get facing() {
        return wallDebrisSlab.facing[this._row];
    }
    set facing(v) {
        wallDebrisSlab.facing[this._row] = v;
    }
    get ageMs() {
        return wallDebrisSlab.ageMs[this._row];
    }
    set ageMs(v) {
        wallDebrisSlab.ageMs[this._row] = v;
    }
    get alpha() {
        return wallDebrisSlab.alpha[this._row];
    }
    set alpha(v) {
        wallDebrisSlab.alpha[this._row] = v;
    }
    get momentOfInertia() {
        return this.mass * this.radius * this.radius * 0.5;
    }
    get angle() {
        return this.facing;
    }
    set angle(v) {
        this.facing = v;
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
class WallDebrisStore {
    constructor(engine, world) {
        this.engine = engine;
        this.world = world;
        this._bodies = [];
    }
    list() {
        return this._bodies;
    }
    _acquireRow() {
        let row = wallDebrisFreeStack.pop();
        if (row === undefined) {
            row = wallDebrisSlab.activeCount;
            if (row >= MAX_WALL_DEBRIS) throw new Error(`Wall debris slab capacity exceeded (${MAX_WALL_DEBRIS})`);
            wallDebrisSlab.activeCount = row + 1;
        }
        wallDebrisSlab.alpha[row] = 1;
        wallDebrisSlab.ageMs[row] = 0;
        return row;
    }
    _releaseRow(row) {
        wallDebrisBodiesByRow[row] = null;
        wallDebrisFreeStack.push(row);
    }
    acquireBody(type, x, y, facing = 0) {
        const row = this._acquireRow();
        let body = wallDebrisBodiesByRow[row];
        if (!body) {
            body = new WallDebrisBody(this);
            wallDebrisBodiesByRow[row] = body;
        }
        body._store = this;
        body._row = row;
        body.id = wallDebrisNextId++;
        body.type = type;
        body.strategy = buildWorldPropStrategyFromAsset(propCatalog[type]);
        body.isDead = false;
        body.isSleeping = false;
        body.shape = undefined;
        body.collisionParts = undefined;
        body.chunks = undefined;
        body.footprintVertices = undefined;
        body.footprintArea = undefined;
        body._fractureCooldown = 0;
        body._neighbors = undefined;
        body._neighborsFrameId = -1;
        wallDebrisSlab.x[row] = x;
        wallDebrisSlab.y[row] = y;
        wallDebrisSlab.vx[row] = 0;
        wallDebrisSlab.vy[row] = 0;
        wallDebrisSlab.w[row] = 0;
        wallDebrisSlab.facing[row] = facing;
        return body;
    }
    _releaseTransient(body) {
        body.isDead = true;
        this._releaseRow(body._row);
        body._row = -1;
    }
    remove(body, spatialFrame) {
        if (!spatialFrame) throw new Error("Wall debris removal requires spatial frame");
        if (!body?.isWallDebris || body._row < 0) throw new Error("Invalid wall debris removal");
        if (body._physId !== undefined) spatialFrame.evictKineticProp(body, this.world.kinetic);
        const index = this._bodies.indexOf(body);
        if (index < 0) throw new Error("Wall debris body missing from store");
        this._bodies.splice(index, 1);
        body.isDead = true;
        this._releaseRow(body._row);
        body._row = -1;
    }
    spawnFromBreak(desc, spatialFrame) {
        if (!spatialFrame) throw new Error("Wall debris break spawn requires spatial frame");
        const propType = desc.kind === "voxel" ? "wall_voxel_chunk" : "wall_rail_chunk";
        const parent = this.acquireBody(propType, desc.x, desc.y, desc.angle);
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
        if (!fracture) {
            this._releaseTransient(parent);
            throw new Error("Wall break produced no fracture debris");
        }
        const stores = fracture._stores ?? this.engine.stores;
        const random = FractureEngine._fractureRandomFromImpact(fracture.originX, fracture.originY, fracture.impactForce, 991);
        const spawned = this.spawnShardsFromFracture(
            this.world,
            parent,
            fracture,
            stores,
            (frag, geom) => {
                FractureEngine._applyShardBurstImpulse(fracture, frag, geom, random);
            },
            sourceMotion,
        );
        if (!spawned.length) {
            releaseDebrisGeomHandles(stores, fracture.debrisStart, fracture.debrisCount);
            stores.debris.reset();
            this._releaseTransient(parent);
            throw new Error("Wall break spawned no debris bodies");
        }
        for (let i = 0; i < spawned.length; i++) if (desc.wallHeight != null) spawned[i].height = desc.wallHeight;
        admitKineticPropsBatch(spatialFrame, spawned, this.world);
        releaseDebrisGeomHandles(stores, fracture.debrisStart, fracture.debrisCount);
        stores.debris.reset();
        this._releaseTransient(parent);
        return spawned;
    }
    spawnShardsFromFracture(world, sourceProp, fracture, stores = moduleStores, configureShard = null, sourceMotion = null) {
        const facing = fracture.facing;
        const cos = Math.cos(facing);
        const sin = Math.sin(facing);
        const motion = sourceMotion ?? FractureEngine._currentPropMotion(sourceProp);
        const wallChunkProfileId = sourceProp.wallChunkProfileId;
        const wallChunkHeightPx = sourceProp.wallChunkHeightPx;
        const shardHeight = sourceProp.height;
        const shardType = sourceProp.type;
        const debris = stores.debris;
        const spawned = [];
        for (let i = fracture.debrisStart; i < fracture.debrisStart + fracture.debrisCount; i++) {
            const cx = debris.centroidX[i];
            const cy = debris.centroidY[i];
            const worldPos = transformPoint2DInto({ x: 0, y: 0 }, fracture.originX, fracture.originY, cx, cy, cos, sin);
            const body = this.acquireBody(shardType, worldPos.x, worldPos.y, facing);
            if (debris.hasChunkRun[i] === 2) FractureEngine.applyPropFractureGeometry(body, debris.chunkGeometry[i]);
            else {
                const geom = materializePolygonDebris(stores, i);
                FractureEngine.applyPropFractureGeometry(body, geom);
                stores.geom.release(debris.vertHandle[i]);
                debris.vertHandle[i] = 0;
            }
            body.vx = motion.vx ?? 0;
            body.vy = motion.vy ?? 0;
            body.angularVelocity = motion.w ?? 0;
            body._fractureCooldown = FRACTURE_TUNING.shared.cooldown;
            if (wallChunkProfileId !== undefined) {
                body.wallChunkProfileId = wallChunkProfileId;
                body.wallChunkHeightPx = wallChunkHeightPx;
            }
            if (shardHeight != null) body.height = shardHeight;
            if (configureShard) configureShard(body, { centroid: { cx, cy } }, i - fracture.debrisStart);
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
    integrateSpawned(frame, bodies, dtMs) {
        if (!bodies.length || dtMs <= 0) return;
        const integrated = [];
        for (let i = 0; i < bodies.length; i++) {
            const body = bodies[i];
            if (body.isDead || body.isSleeping) continue;
            body.tickPropSubstep(dtMs);
            integrated.push(body);
        }
        if (!integrated.length) return;
        snapshotKineticBodySlab(integrated);
        frame.reindexKineticBodies(integrated);
    }
}
export class FractureEngine {
    constructor(world) {
        this.world = world;
        this.wallDebris = new WallDebrisStore(this, world);
        this.deferredFractures = [];
        this.deferredFracturesCount = 0;
        this._splitVisited = null;
        this._splitHitMask = null;
        this._splitQueue = null;
        const geom = new FractureGeomPool();
        this.stores = { geom, debris: new FractureDebrisStore(geom), chunkGrid: new FractureChunkGrid(geom) };
    }
    processKineticContactFractures(tick, contacts, hooks = {}) {
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
            this.queueFractureKineticContact(tick, bodyA, bodyB, hitX, hitY, force, nx, ny);
        }
        this.flushDeferredFractures(tick.world, tick.frame, hooks);
    }
    flushDeferredFractures(world, spatialFrame, hooks = {}) {
        const count = this.deferredFracturesCount;
        if (count === 0) return;
        world.entityRegistry.beginMembershipBatch();
        const propsToAdmit = [];
        const deferredFractures = this.deferredFractures;
        try {
            for (let i = 0; i < count; i++) {
                const item = deferredFractures[i];
                const prop = item.prop;
                delete prop._pendingEviction;
                const onBeforeEvict = item.mode === "circle" ? (w, p) => hooks.onCircleFracture?.(w, p) : null;
                FractureEngine.commitFractureResult(world, prop, item, spatialFrame, { retainParent: item.retainParent, onBeforeEvict, propsToAdmitOut: propsToAdmit, stores: this.stores, resetDebrisStore: false });
                item.prop = null;
            }
            admitKineticPropsBatch(spatialFrame, propsToAdmit, world);
        } finally {
            world.entityRegistry.endMembershipBatch();
            this.stores.debris.reset();
            this.deferredFracturesCount = 0;
        }
    }
    queueFractureKineticContact(tick, bodyA, bodyB, hitX, hitY, force, nx = 0, ny = 0) {
        for (let i = 0; i < 2; i++) {
            const prop = i === 0 ? bodyA : bodyB;
            const other = i === 0 ? bodyB : bodyA;
            if (prop._physId === undefined) continue;
            if (!FractureEngine.evalFractureRules(prop, other, force)) continue;
            const mode = prop.strategy?.fracture?.mode;
            if (mode !== "circle") {
                if (!FractureEngine.canFracturePropSplit(prop)) continue;
                if (prop._fractureCooldown > 0) continue;
                if (mode === "glass" && other.strategy?.fracture?.mode === "glass") continue;
            }
            if (prop._pendingEviction) continue;
            const fracture = FractureEngine.fracturePropOnImpact(prop, hitX, hitY, force, this);
            if (!fracture) continue;
            prop._pendingEviction = true;
            this.enqueueDeferredFracture(prop, fracture, mode);
            // One contact -> at most one fracture event (avoid double-spawn cascades).
            return;
        }
    }
    enqueueDeferredFracture(prop, fracture, mode) {
        const deferredFractures = this.deferredFractures;
        let count = this.deferredFracturesCount;
        let item = deferredFractures[count];
        if (!item) {
            item = { mode: "", retainParent: false, prop: null, debrisStart: 0, debrisCount: 0, originX: 0, originY: 0, impactLocalX: 0, impactLocalY: 0, impactForce: 0, facing: 0 };
            deferredFractures[count] = item;
        }
        const modeEntry = FractureEngine.resolveFractureMode(mode);
        item.mode = mode;
        item.retainParent = modeEntry?.retainParent ?? false;
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
    static acquireShard(x, y, shardPropId, facing = null) {
        let list = shardPools.get(shardPropId);
        if (!list) {
            list = [];
            shardPools.set(shardPropId, list);
        }
        let prop;
        if (list.length > 0) {
            prop = list.pop();
            prop.initializeSpawn(x, y, shardPropId, facing);
            prop.changeState("normal");
        } else prop = new WorldProp(x, y, shardPropId, facing);
        prop._fractureSpawned = true;
        return prop;
    }
    static releaseShard(prop) {
        if (!prop?._fractureSpawned) return;
        const type = prop.type;
        if (prop._footprintGeomHandle) {
            moduleStores.geom.release(prop._footprintGeomHandle);
            delete prop._footprintGeomHandle;
        }
        prop.shape = undefined;
        prop.collisionParts = undefined;
        prop.footprintVertices = undefined;
        delete prop._fractureSpawned;
        let list = shardPools.get(type);
        if (!list) {
            list = [];
            shardPools.set(type, list);
        }
        if (list.indexOf(prop) === -1) list.push(prop);
    }
    static evalFractureRules(prop, other, force) {
        const config = prop.strategy?.fracture;
        if (!config) return false;
        const minForce = config.minForce ?? (config.mode === "glass" ? GLASS_FRACTURE_IMPACT_THRESHOLD : FRACTURE_IMPACT_THRESHOLD);
        if (force < minForce) return false;
        if (config.threatType && other.type !== config.threatType) return false;
        const selfFaction = prop.faction;
        if (config.excludeFactions && selfFaction != null && config.excludeFactions.includes(selfFaction)) return false;
        if (config.opponentOnly) {
            const otherFaction = other.faction;
            if (selfFaction == null || otherFaction == null) return false;
            if (selfFaction === otherFaction) return false;
        }
        return true;
    }
    static commitFractureResult(world, prop, fracture, spatialFrame, { retainParent = false, onBeforeEvict = null, height = null, propsToAdmitOut = null, stores = null, resetDebrisStore = true } = {}) {
        const sourceMotion = FractureEngine._currentPropMotion(prop);
        if (retainParent) {
            wakeKineticBody(prop);
            if (propsToAdmitOut) propsToAdmitOut.push(prop);
        } else {
            onBeforeEvict?.(world, prop);
            if (prop.isWallDebris) world.fractureEngine.wallDebris.remove(prop, spatialFrame);
            else if (spatialFrame) removeWorldPropFromState(world, prop, spatialFrame);
            else {
                const index = world.worldProps.indexOf(prop);
                if (index >= 0) world.worldProps.splice(index, 1);
                world.entityRegistry.unregister(prop);
                pruneKineticConstraintsForBody(world.kinetic, prop.id);
                prop.isDead = true;
            }
        }
        const resolvedStores = stores ?? fracture._stores ?? moduleStores;
        const shards = FractureEngine.spawnFractureShards(world, prop, fracture, spatialFrame, resolvedStores, sourceMotion);
        if (height != null) for (let i = 0; i < shards.length; i++) shards[i].height = height;
        if (propsToAdmitOut) for (let i = 0; i < shards.length; i++) propsToAdmitOut.push(shards[i]);
        else {
            const propsToAdmit = retainParent ? (prop.isWallDebris ? [...shards] : [prop, ...shards]) : shards;
            admitKineticPropsBatch(spatialFrame, propsToAdmit, world);
        }
        releaseDebrisGeomHandles(resolvedStores, fracture.debrisStart, fracture.debrisCount);
        if (resetDebrisStore) resolvedStores.debris.reset();
        return shards;
    }
    static spawnFractureShards(world, sourceProp, fracture, spatialFrame = null, stores = null, sourceMotion = null) {
        if (sourceProp.isWallDebris || isWallChunkPropType(sourceProp.type)) return world.fractureEngine.wallDebris.spawnShardsFromFracture(world, sourceProp, fracture, stores ?? fracture._stores ?? moduleStores, null, sourceMotion);
        const entry = FractureEngine.resolveFractureMode(sourceProp.strategy?.fracture?.mode);
        if (!entry?.spawnShards) return [];
        const resolvedStores = stores ?? fracture._stores ?? moduleStores;
        return entry.spawnShards(world, sourceProp, fracture, spatialFrame, resolvedStores);
    }
    static materializeDebrisGeometries(stores, debrisStart, debrisCount) {
        const geometries = [];
        for (let i = debrisStart; i < debrisStart + debrisCount; i++)
            if (stores.debris.hasChunkRun[i] === 2) geometries.push(stores.debris.chunkGeometry[i]);
            else geometries.push(materializePolygonDebris(stores, i));
        return geometries;
    }
    static fractureDebrisGeometries(fracture) {
        const stores = fracture._stores ?? moduleStores;
        return FractureEngine.materializeDebrisGeometries(stores, fracture.debrisStart, fracture.debrisCount);
    }
    static fracturePropOnImpact(prop, worldHitX, worldHitY, impactForce, engine = null) {
        const stores = fractureStoresFor(engine);
        if (!engine || engine.deferredFracturesCount === 0) stores.debris.reset();
        const mode = prop.strategy?.fracture?.mode;
        if (mode === "circle") if (prop.shape?.type !== "Circle") throw new Error(`fracture.mode "circle" requires Circle shape, got ${prop.shape?.type ?? "none"}`);
        const entry = FractureEngine.resolveFractureMode(mode);
        if (!entry?.onImpact) return null;
        return entry.onImpact(prop, worldHitX, worldHitY, impactForce, stores);
    }
    static impactForceFromContact(relativeSpeed, massA = 1, massB = 1) {
        return relativeSpeed * 0.5 + Math.sqrt(massA * massB) * 0.3;
    }
    static fractureSpawnedWallChunk(state, prop, strike, spatialFrame) {
        const force = FractureEngine.impactForceFromContact(strike.sourceSpeed, strike.sourceMass, prop.mass ?? 1) + FRACTURE_TUNING.wallSpawn.forceBias;
        const fracture = FractureEngine.fracturePropOnImpact(prop, strike.contactX, strike.contactY, force);
        if (!fracture) return [];
        const modeEntry = FractureEngine.resolveFractureMode(prop.strategy?.fracture?.mode);
        return FractureEngine.commitFractureResult(state, prop, fracture, spatialFrame, { retainParent: modeEntry?.retainParent ?? false, height: strike.height });
    }
    static worldHitToPropLocal(prop, worldX, worldY) {
        const origin = FractureEngine._propWorldPosition(prop);
        const dx = worldX - origin.x;
        const dy = worldY - origin.y;
        const cos = Math.cos(entityFacing(prop));
        const sin = Math.sin(entityFacing(prop));
        return { x: dx * cos + dy * sin, y: -dx * sin + dy * cos };
    }
    static splitFootprintIntoComponents(prop, localHitX, localHitY, impactForce, forceExplode = false) {
        return FractureEngine._splitMeshComponents(prop.chunks, localHitX, localHitY, impactForce, forceExplode).map((comp) => FractureEngine._geometryFromChunkComponent(comp, false));
    }
    static spawnShardPropsFromDebrisStore(world, sourceProp, fracture, shardPropId, stores, spatialFrame = null, configureShard = null) {
        const facing = fracture.facing;
        const cos = Math.cos(facing);
        const sin = Math.sin(facing);
        const motion = FractureEngine._currentPropMotion(sourceProp);
        const faction = sourceProp.faction;
        const wallChunkProfileId = sourceProp.wallChunkProfileId;
        const wallChunkHeightPx = sourceProp.wallChunkHeightPx;
        const spawned = [];
        const debris = stores.debris;
        for (let i = fracture.debrisStart; i < fracture.debrisStart + fracture.debrisCount; i++) {
            const cx = debris.centroidX[i];
            const cy = debris.centroidY[i];
            const worldPos = transformPoint2DInto({ x: 0, y: 0 }, fracture.originX, fracture.originY, cx, cy, cos, sin);
            const shard = FractureEngine.acquireShard(worldPos.x, worldPos.y, shardPropId, facing);
            if (debris.hasChunkRun[i] === 2) FractureEngine.applyPropFractureGeometry(shard, debris.chunkGeometry[i]);
            else {
                const geom = materializePolygonDebris(stores, i);
                FractureEngine.applyPropFractureGeometry(shard, geom);
                stores.geom.release(debris.vertHandle[i]);
                debris.vertHandle[i] = 0;
            }
            shard.faction = faction;
            shard.vx = motion.vx;
            shard.vy = motion.vy;
            shard.angularVelocity = motion.w;
            shard._fractureCooldown = FRACTURE_TUNING.shared.cooldown;
            if (sourceProp.visualOverride !== undefined) shard.visualOverride = { ...sourceProp.visualOverride };
            if (wallChunkProfileId !== undefined) {
                shard.wallChunkProfileId = wallChunkProfileId;
                shard.wallChunkHeightPx = wallChunkHeightPx;
            }
            if (configureShard) configureShard(shard, { centroid: { cx, cy } }, i - fracture.debrisStart);
            spawned.push(shard);
        }
        if (spawned.length > 0) {
            addWorldPropsToState(world, spawned);
            for (let i = 0; i < spawned.length; i++) wakeKineticBody(spawned[i]);
        }
        return spawned;
    }
    static buildCircleImpactShards(radius, localHit, impactForce, { minShards = 4, maxShards = 5 } = {}, stores = moduleStores) {
        const debrisStart = stores.debris.write;
        FractureEngine._buildCircleImpactShardsIntoStore(stores, radius, localHit, impactForce, { minShards, maxShards });
        const debrisCount = stores.debris.write - debrisStart;
        const geometries = FractureEngine.materializeDebrisGeometries(stores, debrisStart, debrisCount);
        releaseDebrisGeomHandles(stores, debrisStart, debrisCount);
        stores.debris.reset();
        return geometries;
    }
    static _buildCircleImpactShardsIntoStore(stores, radius, localHit, impactForce, { minShards = 4, maxShards = 5 } = {}) {
        const count = FractureEngine._circleShardCount(impactForce, minShards, maxShards);
        const hitDist = Math.hypot(localHit.x, localHit.y);
        const inset = hitDist > 1e-6 ? Math.min(radius * 0.42, hitDist * 0.45) / hitDist : 0;
        const apexX = localHit.x * inset;
        const apexY = localHit.y * inset;
        const start = Math.atan2(localHit.y, localHit.x) - Math.PI / count;
        const polySides = 16;
        const parentPoints = new Float32Array(polySides * 2);
        for (let i = 0; i < polySides; i++) {
            const angle = (i * Math.PI * 2) / polySides;
            parentPoints[i * 2] = Math.cos(angle) * radius;
            parentPoints[i * 2 + 1] = Math.sin(angle) * radius;
        }
        for (let i = 0; i < count; i++) {
            const a0 = start + (i * Math.PI * 2) / count;
            const a1 = start + ((i + 1) * Math.PI * 2) / count;
            const clip = stores.geom.wedgeClip(parentPoints, polySides, apexX, apexY, a0, a1);
            if (clip.vertCount >= 3) stores.debris.appendCenteredPolygon(clip.handle, clip.vertCount);
            else if (clip.handle) stores.geom.release(clip.handle);
        }
    }
    static applyPropFractureGeometry(prop, geometry) {
        if (geometry.collisionParts) {
            prop.chunks = geometry.chunks;
            prop.collisionParts = geometry.collisionParts;
        } else {
            prop.chunks = undefined;
            prop.collisionParts = undefined;
        }
        prop.footprintVertices = geometry.footprintVertices;
        prop.footprintArea = geometry.footprintArea;
        prop.radius = geometry.boundingRadius;
        prop.shape = new PolygonShape(geometry.footprintVertices);
        markBroadphaseDirty(prop);
        prop.mass = kineticMassFromFootprint(prop);
    }
    static shouldInitFractureFootprint(prop) {
        const entry = FractureEngine.resolveFractureMode(prop.strategy?.fracture?.mode);
        return entry?.initFootprint ?? false;
    }
    static resolveFractureMode(mode) {
        return FRACTURE_MODES[mode] ?? null;
    }
    static initFractureFootprint(prop) {
        if (FractureEngine._isGlassFracture(prop)) return;
        if (!FractureEngine.shouldInitFractureFootprint(prop)) throw new Error(`Fracture props need fracture.mode "chunk" or "glass", got ${prop.strategy?.fracture?.mode}`);
        FractureEngine.applyPropFractureGeometry(prop, FractureEngine.bakeChunkOutline(FractureEngine._flatVertsFromShape(prop)));
    }
    static canFracturePropSplit(prop, minSize = FRACTURE_MIN_PIECE_SIZE) {
        if (!prop?.strategy?.fracture) return false;
        const entry = FractureEngine.resolveFractureMode(prop.strategy.fracture.mode);
        if (entry?.canSplit) return entry.canSplit(prop, minSize);
        if (entry?.skipCanSplit) return true;
        return false;
    }
    static shatterGlassFootprint(hx, hy, hitX, hitY, impactForce = 10, random = Math.random) {
        const flat = boxLocalFootprint(hx, hy);
        return FractureEngine.shatterGlassPolygon(flat, hitX, hitY, impactForce, random);
    }
    static shatterGlassPolygon(flatVerts, hitX, hitY, impactForce = 10, random = Math.random, stores = moduleStores) {
        if (flatVerts.length < 6) return [];
        stores.debris.reset();
        const parentArea = Math.abs(polygonSignedArea2D(flatVerts));
        const { x: apexX, y: apexY } = FractureEngine._resolveShatterApex(flatVerts, hitX, hitY);
        let shardCount = FractureEngine._shardCountForPolygon(flatVerts, impactForce, apexX, apexY);
        let result = FractureEngine._shatterGlassIntoStore(stores, flatVerts, apexX, apexY, shardCount, random);
        const minArea = FractureEngine.minShardAreaForPolygon(flatVerts);
        const areaCap = Math.max(2, Math.floor(parentArea / minArea));
        const minShardsAllowed = Math.min(4, areaCap);
        for (let attempt = 0; attempt < 4; attempt++) {
            const totalArea = stores.debris.totalArea(result.debrisStart, result.debrisCount);
            if (result.debrisCount >= 2 && totalArea >= parentArea * 0.92) {
                const geometries = FractureEngine.materializeDebrisGeometries(stores, result.debrisStart, result.debrisCount);
                releaseDebrisGeomHandles(stores, result.debrisStart, result.debrisCount);
                stores.debris.reset();
                return geometries;
            }
            releaseDebrisGeomHandles(stores, result.debrisStart, result.debrisCount);
            stores.debris.reset();
            shardCount = Math.max(minShardsAllowed, Math.floor(shardCount * 0.72));
            result = FractureEngine._shatterGlassIntoStore(stores, flatVerts, apexX, apexY, shardCount, random);
        }
        if (result.debrisCount >= 2) {
            const geometries = FractureEngine.materializeDebrisGeometries(stores, result.debrisStart, result.debrisCount);
            releaseDebrisGeomHandles(stores, result.debrisStart, result.debrisCount);
            stores.debris.reset();
            return geometries;
        }
        stores.debris.reset();
        return [];
    }
    static _shatterGlassIntoStore(stores, flatVerts, apexX, apexY, shardCount, random) {
        const debrisStart = stores.debris.write;
        FractureEngine._buildGlassShardsIntoStore(stores, flatVerts, apexX, apexY, shardCount, random);
        return { debrisStart, debrisCount: stores.debris.write - debrisStart };
    }
    static buildShardGeometry(flatVerts) {
        const { cx, cy, signedArea } = polygonCentroid2D(flatVerts);
        const count = flatVerts.length / 2;
        const centered = new Float32Array(count * 2);
        for (let i = 0; i < count; i++) {
            centered[i * 2] = flatVerts[i * 2] - cx;
            centered[i * 2 + 1] = flatVerts[i * 2 + 1] - cy;
        }
        return { footprintVertices: centered, footprintArea: Math.abs(signedArea), boundingRadius: FractureEngine._boundingRadiusFromFootprint(centered), centroid: { cx, cy } };
    }
    static wedgePolygonIntersection(flatVerts, apexX, apexY, angle0, angle1, stores = moduleStores) {
        const vertCount = flatVerts.length / 2;
        const clip = stores.geom.wedgeClip(flatVerts, vertCount, apexX, apexY, angle0, angle1);
        if (clip.vertCount < 3) {
            if (clip.handle) stores.geom.release(clip.handle);
            return new Float32Array(0);
        }
        const slice = stores.geom.footprintSlice(clip.handle, clip.vertCount);
        stores.geom.release(clip.handle);
        return slice;
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
    static chunkCollisionPartsArea(collisionParts) {
        let area = 0;
        for (let i = 0; i < collisionParts.length; i++) {
            const verts = collisionParts[i].vertices;
            const w = Math.abs(verts[2] - verts[0]);
            const h = Math.abs(verts[5] - verts[3]);
            area += w * h;
        }
        return area;
    }
    static chunkCellCount(hx, hy, cellSize = FractureEngine.cellSizeForBoxExtents(hx, hy)) {
        const cols = Math.max(1, Math.round((hx * 2) / cellSize));
        const rows = Math.max(1, Math.round((hy * 2) / cellSize));
        return cols * rows;
    }
    static bakeChunkOutline(flatVerts, stores = moduleStores) {
        const centeredVerts = FractureEngine._centerFlatVerts(flatVerts);
        const { hx, hy } = FractureEngine._halfExtentsFromFlat(centeredVerts);
        const cellSize = FractureEngine.cellSizeForBoxExtents(hx, hy);
        stores.chunkGrid.fillRectGrid(hx, hy, cellSize);
        const chunks = stores.chunkGrid.materializeChunks();
        const parts = chunks.map((chunk) => ({ vertices: chunk.vertices }));
        const mesh = FractureEngine.buildGeometryFromPartsAtOrigin(parts);
        return FractureEngine._withChunkCollisionParts({ footprintVertices: mesh.footprintVertices, chunks: mesh.chunks, footprintArea: mesh.footprintArea, boundingRadius: mesh.boundingRadius });
    }
    static buildChunkGeometryAtPropOrigin(localParts) {
        const geom = FractureEngine.buildGeometryFromPartsAtOrigin(localParts);
        return FractureEngine._withChunkCollisionParts({ footprintVertices: geom.footprintVertices, chunks: geom.chunks, footprintArea: geom.footprintArea, boundingRadius: geom.boundingRadius });
    }
    static buildGeometryFromChunkParts(localParts) {
        const geom = FractureEngine._buildGeometryFromCellParts(localParts);
        return FractureEngine._withChunkCollisionParts({ footprintVertices: geom.footprintVertices, chunks: geom.chunks, footprintArea: geom.footprintArea, boundingRadius: geom.boundingRadius, centroid: geom.centroid });
    }
    static rectGridParts(hx, hy, cellSize, stores = moduleStores) {
        stores.chunkGrid.fillRectGrid(hx, hy, cellSize);
        const parts = [];
        for (let i = 0; i < stores.chunkGrid.count; i++) {
            const handle = stores.chunkGrid.rectVertsHandle(i);
            parts.push({ vertices: stores.geom.footprintSlice(handle, 4) });
            stores.geom.release(handle);
        }
        return parts;
    }
    static mergeChunkCollisionRects(chunks) {
        let rects = chunks.map(FractureEngine._rectFromChunk);
        let prev = rects.length + 1;
        while (rects.length < prev) {
            prev = rects.length;
            rects = FractureEngine._mergeRectsVertically(FractureEngine._mergeRectsHorizontally(rects));
        }
        return rects;
    }
    static subdivideSingleChunkAtMinCell(chunk) {
        const rect = FractureEngine._rectFromChunk(chunk);
        const hx = (rect.x1 - rect.x0) * 0.5;
        const hy = (rect.y1 - rect.y0) * 0.5;
        if (!FractureEngine.chunkNeedsMinCellSubdivide(chunk)) return null;
        const parts = FractureEngine._rectGridPartsCeil(hx, hy, CHUNK_MIN_CELL);
        if (parts.length <= 1) return null;
        return FractureEngine.buildChunkGeometryAtPropOrigin(parts.map((part) => ({ vertices: part.vertices })));
    }
    static chunkNeedsMinCellSubdivide(chunk) {
        const { w, h } = FractureEngine._chunkRectSpan(chunk);
        const eps = FRACTURE_TUNING.chunk.rectMergeEps;
        return w > CHUNK_MIN_CELL + eps || h > CHUNK_MIN_CELL + eps;
    }
    static cellSizeForBoxExtents(hx, hy) {
        const span = Math.min(hx * 2, hy * 2);
        const cellsPerAxis = Math.min(CHUNK_MAX_CELLS_PER_AXIS, Math.max(2, Math.round(span / 16)));
        return Math.max(CHUNK_MIN_CELL, span / cellsPerAxis);
    }
    static splitChunks(chunks, localHitX, localHitY, impactForce = 5, engine = null) {
        if (!chunks || chunks.length <= 1) return [chunks];
        if (engine) return FractureEngine._splitChunksWithScratch(FractureEngine._prepareEngineScratch(engine, chunks.length), chunks, localHitX, localHitY, impactForce);
        return FractureEngine._splitChunksWithScratch(FractureEngine._prepareStaticScratch(chunks.length), chunks, localHitX, localHitY, impactForce);
    }
    static splitPoxels(chunks, localHitX, localHitY, impactForce = 5, engine = null) {
        return FractureEngine.splitChunks(chunks, localHitX, localHitY, impactForce, engine);
    }
    static buildGeometryFromPartsAtOrigin(localParts) {
        const parts = localParts.map((p) => ({ vertices: p.vertices }));
        const boundaryPoints = FractureEngine._getOuterBoundary(parts);
        const footprintVertices = new Float32Array(boundaryPoints.length);
        footprintVertices.set(boundaryPoints);
        const { signedArea } = polygonCentroid2D(footprintVertices, SHARED_CENTROID);
        return FractureEngine._finalizeFootprintGeometry(footprintVertices, parts, signedArea, { cx: 0, cy: 0 });
    }
    static fractureDeterministicRandom(seed) {
        return deterministicUnitRandom(seed);
    }
    static _fractureRandomFromImpact(worldHitX, worldHitY, impactForce, salt = 0) {
        let call = 0;
        const base = Math.imul(Math.floor(worldHitX * 1000), 73856093) ^ Math.imul(Math.floor(worldHitY * 1000), 19349663) ^ Math.imul(Math.floor(impactForce * 100), 83492791) ^ salt;
        return () => FractureEngine.fractureDeterministicRandom(base ^ Math.imul(++call, 2654435761));
    }
    static _hashV(x, y) {
        return (Math.imul(Math.round(x * 10000), 73856093) ^ Math.imul(Math.round(y * 10000), 19349663)) & 0xffff;
    }
    static _edgeKey(ha, hb) {
        return ha < hb ? (ha << 16) | (hb & 0xffff) : (hb << 16) | (ha & 0xffff);
    }
    static _calculateCentroidOfParts(parts) {
        let totalCX = 0;
        let totalCY = 0;
        let totalArea = 0;
        for (let i = 0; i < parts.length; i++) {
            const verts = parts[i].vertices || parts[i];
            const { cx, cy, signedArea } = polygonCentroid2D(verts, SHARED_CENTROID);
            const absArea = Math.abs(signedArea);
            totalCX += cx * absArea;
            totalCY += cy * absArea;
            totalArea += absArea;
        }
        if (totalArea > 0) {
            const invTotalArea = 1 / totalArea;
            SHARED_CENTROID.cx = totalCX * invTotalArea;
            SHARED_CENTROID.cy = totalCY * invTotalArea;
        } else {
            SHARED_CENTROID.cx = 0;
            SHARED_CENTROID.cy = 0;
        }
        SHARED_CENTROID.signedArea = totalArea;
        return SHARED_CENTROID;
    }
    static _getOuterBoundary(parts) {
        const edgeCounts = new Map();
        const vMap = new Map();
        for (let i = 0; i < parts.length; i++) {
            const v = parts[i].vertices;
            const count = v.length / 2;
            let area = 0;
            for (let j = 0; j < count; j++) {
                const ax = v[j * 2];
                const ay = v[j * 2 + 1];
                const nextIdx = ((j + 1) % count) * 2;
                const bx = v[nextIdx];
                const by = v[nextIdx + 1];
                area += ax * by - bx * ay;
            }
            const isCCW = area > 0;
            for (let j = 0; j < count; j++) {
                const idx1 = isCCW ? j : count - 1 - j;
                const idx2 = isCCW ? (j + 1) % count : (count - j) % count;
                const ax = v[idx1 * 2];
                const ay = v[idx1 * 2 + 1];
                const bx = v[idx2 * 2];
                const by = v[idx2 * 2 + 1];
                const ha = FractureEngine._hashV(ax, ay);
                const hb = FractureEngine._hashV(bx, by);
                if (!vMap.has(ha)) vMap.set(ha, { x: ax, y: ay });
                if (!vMap.has(hb)) vMap.set(hb, { x: bx, y: by });
                const edgeKey = FractureEngine._edgeKey(ha, hb);
                edgeCounts.set(edgeKey, (edgeCounts.get(edgeKey) || 0) + 1);
            }
        }
        const nextMap = new Map();
        for (const edgeKey of edgeCounts.keys())
            if (edgeCounts.get(edgeKey) === 1) {
                const ha = edgeKey >>> 16;
                const hb = edgeKey & 0xffff;
                if (!nextMap.has(ha)) nextMap.set(ha, []);
                nextMap.get(ha).push(hb);
            }
        const loops = [];
        const visited = new Set();
        for (const startHash of nextMap.keys()) {
            if (visited.has(startHash)) continue;
            const loop = [];
            let currentHash = startHash;
            let safety = 0;
            while (safety++ < 10000) {
                visited.add(currentHash);
                const pt = vMap.get(currentHash);
                loop.push(pt.x, pt.y);
                const nextOpts = nextMap.get(currentHash);
                if (!nextOpts || nextOpts.length === 0) break;
                let nextHash = nextOpts.find((h) => !visited.has(h));
                if (!nextHash) {
                    if (nextOpts.includes(startHash)) break;
                    nextHash = nextOpts[0];
                }
                if (nextHash === startHash) break;
                currentHash = nextHash;
            }
            if (safety >= 10000) throw new Error(`getOuterBoundary safety cap exceeded (${parts.length} parts)`);
            loops.push(loop);
        }
        loops.sort((a, b) => b.length - a.length);
        return loops.length > 0 ? loops[0] : parts[0].vertices;
    }
    static _buildChunkGraph(visualParts) {
        const chunks = [];
        for (let i = 0; i < visualParts.length; i++) {
            const v = visualParts[i].vertices;
            const count = v.length / 2;
            let cx = 0;
            let cy = 0;
            for (let j = 0; j < count; j++) {
                cx += v[j * 2];
                cy += v[j * 2 + 1];
            }
            cx /= count;
            cy /= count;
            chunks.push({ id: i, vertices: visualParts[i].vertices, neighbors: [], cx, cy });
        }
        const edgeMap = new Map();
        for (let i = 0; i < chunks.length; i++) {
            const v = chunks[i].vertices;
            const count = v.length / 2;
            for (let j = 0; j < count; j++) {
                const ax = v[j * 2];
                const ay = v[j * 2 + 1];
                const nextIdx = ((j + 1) % count) * 2;
                const bx = v[nextIdx];
                const by = v[nextIdx + 1];
                const h1 = FractureEngine._hashV(ax, ay);
                const h2 = FractureEngine._hashV(bx, by);
                const edgeKey = FractureEngine._edgeKey(h1, h2);
                const edge = edgeMap.get(edgeKey);
                if (!edge) edgeMap.set(edgeKey, [i]);
                else edge.push(i);
            }
        }
        for (const indices of edgeMap.values())
            if (indices.length === 2) {
                const a = indices[0];
                const b = indices[1];
                if (!chunks[a].neighbors.includes(b)) chunks[a].neighbors.push(b);
                if (!chunks[b].neighbors.includes(a)) chunks[b].neighbors.push(a);
            }
        return chunks;
    }
    static _halfExtentsFromFootprint(footprintVertices) {
        let minX = Infinity;
        let maxX = -Infinity;
        let minY = Infinity;
        let maxY = -Infinity;
        const count = footprintVertices.length / 2;
        for (let i = 0; i < count; i++) {
            const vx = footprintVertices[i * 2];
            const vy = footprintVertices[i * 2 + 1];
            if (vx < minX) minX = vx;
            if (vx > maxX) maxX = vx;
            if (vy < minY) minY = vy;
            if (vy > maxY) maxY = vy;
        }
        return { x: (maxX - minX) * 0.5, y: (maxY - minY) * 0.5 };
    }
    static _boundingRadiusFromFootprint(footprintVertices) {
        let maxRadiusSq = 0;
        const count = footprintVertices.length / 2;
        for (let i = 0; i < count; i++) {
            const vx = footprintVertices[i * 2];
            const vy = footprintVertices[i * 2 + 1];
            const distSq = vx * vx + vy * vy;
            if (distSq > maxRadiusSq) maxRadiusSq = distSq;
        }
        return Math.sqrt(maxRadiusSq);
    }
    static _cloneChunks(chunks) {
        return chunks.map((chunk) => {
            const pVerts = new Float32Array(chunk.vertices.length);
            pVerts.set(chunk.vertices);
            return { id: chunk.id, vertices: pVerts, neighbors: [...chunk.neighbors], cx: chunk.cx, cy: chunk.cy };
        });
    }
    static _finalizeFootprintGeometry(centeredVerts, visualParts, signedArea, centroid) {
        const chunks = FractureEngine._buildChunkGraph(visualParts);
        const footprintArea = Math.abs(signedArea);
        const halfExtents = FractureEngine._halfExtentsFromFootprint(centeredVerts);
        const boundingRadius = FractureEngine._boundingRadiusFromFootprint(centeredVerts);
        return { footprintVertices: centeredVerts, chunks: FractureEngine._cloneChunks(chunks), footprintArea, halfExtents, boundingRadius, centroid };
    }
    static _buildGeometryFromCellParts(localParts) {
        const { cx, cy } = FractureEngine._calculateCentroidOfParts(localParts);
        const opLen = localParts.length;
        const shiftedParts = new Array(opLen);
        for (let i = 0; i < opLen; i++) {
            const p = localParts[i];
            const count = p.vertices.length / 2;
            const shiftedV = new Float32Array(count * 2);
            for (let j = 0; j < count; j++) {
                shiftedV[j * 2] = p.vertices[j * 2] - cx;
                shiftedV[j * 2 + 1] = p.vertices[j * 2 + 1] - cy;
            }
            shiftedParts[i] = { vertices: shiftedV };
        }
        const boundaryPoints = FractureEngine._getOuterBoundary(shiftedParts);
        const bpCount = boundaryPoints.length / 2;
        const centeredVerts = new Float32Array(bpCount * 2);
        centeredVerts.set(boundaryPoints);
        const { signedArea } = polygonCentroid2D(centeredVerts, SHARED_CENTROID);
        return FractureEngine._finalizeFootprintGeometry(centeredVerts, shiftedParts, signedArea, { cx, cy });
    }
    static _fractureNeighborRoll(localHitX, localHitY, impactForce, neighborIndex) {
        let h = Math.imul(Math.floor(localHitX * 1000), 73856093);
        h ^= Math.imul(Math.floor(localHitY * 1000), 19349663);
        h ^= Math.imul(Math.floor(impactForce * 100), 83492791);
        h ^= Math.imul(neighborIndex, 2654435761);
        return ((h >>> 0) % 10000) / 10000;
    }
    static _halfExtentsFromFlat(flatVerts) {
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
        return { hx: (maxX - minX) * 0.5, hy: (maxY - minY) * 0.5 };
    }
    static _rectFromChunk(chunk) {
        const v = chunk.vertices;
        let x0 = Infinity;
        let x1 = -Infinity;
        let y0 = Infinity;
        let y1 = -Infinity;
        for (let i = 0; i < v.length / 2; i++) {
            const x = v[i * 2];
            const y = v[i * 2 + 1];
            if (x < x0) x0 = x;
            if (x > x1) x1 = x;
            if (y < y0) y0 = y;
            if (y > y1) y1 = y;
        }
        return { x0, y0, x1, y1 };
    }
    static _chunkRectSpan(chunk) {
        const rect = FractureEngine._rectFromChunk(chunk);
        return { w: rect.x1 - rect.x0, h: rect.y1 - rect.y0 };
    }
    static _mergeRectsHorizontally(rects) {
        const groups = new Map();
        for (let i = 0; i < rects.length; i++) {
            const r = rects[i];
            const key = `${r.y0.toFixed(4)};${r.y1.toFixed(4)}`;
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(r);
        }
        const out = [];
        const eps = FRACTURE_TUNING.chunk.rectMergeEps;
        for (const group of groups.values()) {
            group.sort((a, b) => a.x0 - b.x0);
            let cur = group[0];
            for (let i = 1; i < group.length; i++) {
                const next = group[i];
                if (Math.abs(cur.x1 - next.x0) <= eps) cur = { x0: cur.x0, y0: cur.y0, x1: next.x1, y1: cur.y1 };
                else {
                    out.push(cur);
                    cur = next;
                }
            }
            out.push(cur);
        }
        return out;
    }
    static _mergeRectsVertically(rects) {
        const groups = new Map();
        for (let i = 0; i < rects.length; i++) {
            const r = rects[i];
            const key = `${r.x0.toFixed(4)};${r.x1.toFixed(4)}`;
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(r);
        }
        const out = [];
        const eps = FRACTURE_TUNING.chunk.rectMergeEps;
        for (const group of groups.values()) {
            group.sort((a, b) => a.y0 - b.y0);
            let cur = group[0];
            for (let i = 1; i < group.length; i++) {
                const next = group[i];
                if (Math.abs(cur.y1 - next.y0) <= eps) cur = { x0: cur.x0, y0: cur.y0, x1: cur.x1, y1: next.y1 };
                else {
                    out.push(cur);
                    cur = next;
                }
            }
            out.push(cur);
        }
        return out;
    }
    static _rectArea(rect) {
        return (rect.x1 - rect.x0) * (rect.y1 - rect.y0);
    }
    static _chunkMaterialArea(chunks) {
        let area = 0;
        for (let i = 0; i < chunks.length; i++) area += FractureEngine._rectArea(FractureEngine._rectFromChunk(chunks[i]));
        return area;
    }
    static _polygonShapeFromRect(rect) {
        return new PolygonShape(new Float32Array([rect.x0, rect.y0, rect.x1, rect.y0, rect.x1, rect.y1, rect.x0, rect.y1]));
    }
    static _collisionPartsFromChunks(chunks) {
        return FractureEngine.mergeChunkCollisionRects(chunks).map(FractureEngine._polygonShapeFromRect);
    }
    static _boundingRadiusFromParts(collisionParts) {
        let maxR = 0;
        for (let i = 0; i < collisionParts.length; i++) maxR = Math.max(maxR, collisionParts[i].getBoundingRadius());
        return maxR;
    }
    static _footprintVerticesFromParts(collisionParts) {
        let minX = Infinity;
        let maxX = -Infinity;
        let minY = Infinity;
        let maxY = -Infinity;
        for (let p = 0; p < collisionParts.length; p++) {
            const verts = collisionParts[p].vertices;
            const count = verts.length;
            for (let i = 0; i < count; i += 2) {
                const x = verts[i];
                const y = verts[i + 1];
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
            }
        }
        return new Float32Array([minX, minY, maxX, minY, maxX, maxY, minX, maxY]);
    }
    static _withChunkCollisionParts(geom) {
        const collisionParts = FractureEngine._collisionPartsFromChunks(geom.chunks);
        const footprintVertices = FractureEngine._footprintVerticesFromParts(collisionParts);
        return { ...geom, collisionParts, footprintVertices, footprintArea: FractureEngine._chunkMaterialArea(geom.chunks), boundingRadius: FractureEngine._boundingRadiusFromParts(collisionParts) };
    }
    static _centerFlatVerts(flatVerts) {
        const count = flatVerts.length / 2;
        let cx = 0;
        let cy = 0;
        for (let i = 0; i < count; i++) {
            cx += flatVerts[i * 2];
            cy += flatVerts[i * 2 + 1];
        }
        cx /= count;
        cy /= count;
        const centered = new Float32Array(count * 2);
        for (let i = 0; i < count; i++) {
            centered[i * 2] = flatVerts[i * 2] - cx;
            centered[i * 2 + 1] = flatVerts[i * 2 + 1] - cy;
        }
        return centered;
    }
    static _rectGridPartsCeil(hx, hy, maxCellSize) {
        const cols = Math.max(1, Math.ceil((hx * 2) / maxCellSize));
        const rows = Math.max(1, Math.ceil((hy * 2) / maxCellSize));
        const cellW = (hx * 2) / cols;
        const cellH = (hy * 2) / rows;
        const parts = [];
        for (let row = 0; row < rows; row++)
            for (let col = 0; col < cols; col++) {
                const x0 = -hx + col * cellW;
                const y0 = -hy + row * cellH;
                const x1 = x0 + cellW;
                const y1 = y0 + cellH;
                parts.push({ vertices: new Float32Array([x0, y0, x1, y0, x1, y1, x0, y1]) });
            }
        return parts;
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
    static _minDistToPolygonBoundary(x, y, flatVerts) {
        return FractureEngine._closestPointOnPolygonBoundary(x, y, flatVerts).dist;
    }
    static _minThinEdgeForPolygon(flatVerts) {
        return Math.max(3, FractureEngine._polygonSpan(flatVerts) * 0.08);
    }
    static _resolveShatterApex(flatVerts, hitX, hitY) {
        const { cx, cy } = polygonCentroid2D(flatVerts);
        const span = FractureEngine._polygonSpan(flatVerts);
        let ax = hitX;
        let ay = hitY;
        if (!pointInPolygon(ax, ay, flatVerts)) {
            const onEdge = FractureEngine._closestPointOnPolygonBoundary(hitX, hitY, flatVerts);
            ax = onEdge.x;
            ay = onEdge.y;
        }
        const inset = Math.min(span * 0.18, 18);
        const dx = cx - ax;
        const dy = cy - ay;
        const dist = Math.hypot(dx, dy);
        if (dist > 1e-6) {
            const push = Math.min(inset, dist * 0.4);
            ax += (dx / dist) * push;
            ay += (dy / dist) * push;
        }
        if (!pointInPolygon(ax, ay, flatVerts)) {
            ax = cx;
            ay = cy;
        }
        return { x: ax, y: ay };
    }
    static _clipHalfPlane(flatVerts, ax, ay, nx, ny, stores = moduleStores) {
        const vertCount = flatVerts.length / 2;
        if (vertCount === 0) return flatVerts;
        const geom = stores.geom;
        for (let i = 0; i < vertCount; i++) {
            geom.clipA[i * 2] = flatVerts[i * 2];
            geom.clipA[i * 2 + 1] = flatVerts[i * 2 + 1];
        }
        const outCount = geom.clipHalfPlaneInPlace(geom.clipA, vertCount, ax, ay, nx, ny, geom.clipB);
        return geom.footprintSlice(geom.clipB, outCount);
    }
    static _acceptGlassShard(flatVerts, parentFlatVerts) {
        const area = Math.abs(polygonSignedArea2D(flatVerts));
        if (area < GLASS_MIN_SHARD_AREA) return false;
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
        if (thin < FractureEngine._minThinEdgeForPolygon(parentFlatVerts)) return false;
        if (thick / Math.max(1e-6, thin) > GLASS_MAX_SLIVER_ASPECT) return false;
        return true;
    }
    static _buildGlassShardsIntoStore(stores, flatVerts, apexX, apexY, shardCount, random) {
        const baseStep = (Math.PI * 2) / shardCount;
        const offset = random() * Math.PI * 2;
        const angles = [];
        for (let i = 0; i < shardCount; i++) {
            const jitter = (random() - 0.5) * baseStep * 0.25;
            angles.push(offset + i * baseStep + jitter);
        }
        angles.sort((a, b) => a - b);
        const vertCount = flatVerts.length / 2;
        let startIndex = 0;
        let lastStartIdx = -1;
        while (startIndex < angles.length) {
            const a0 = angles[startIndex];
            const a1 = startIndex === angles.length - 1 ? angles[0] + Math.PI * 2 : angles[startIndex + 1];
            const clip = stores.geom.wedgeClip(flatVerts, vertCount, apexX, apexY, a0, a1);
            if (clip.vertCount < 3) {
                if (clip.handle) stores.geom.release(clip.handle);
                startIndex++;
                continue;
            }
            const poly = stores.geom.buffer(clip.handle).subarray(0, clip.vertCount * 2);
            if (FractureEngine._acceptGlassShard(poly, flatVerts)) {
                stores.debris.appendCenteredPolygon(clip.handle, clip.vertCount);
                lastStartIdx = startIndex;
                startIndex++;
            } else {
                let merged = false;
                if (lastStartIdx !== -1) {
                    const prevA0 = angles[lastStartIdx];
                    const angleDiff = a1 - prevA0;
                    if (angleDiff < Math.PI * 0.95) {
                        const mergedClip = stores.geom.wedgeClip(flatVerts, vertCount, apexX, apexY, prevA0, a1);
                        if (mergedClip.vertCount >= 3) {
                            stores.debris.write--;
                            stores.geom.release(stores.debris.vertHandle[stores.debris.write]);
                            stores.debris.appendCenteredPolygon(mergedClip.handle, mergedClip.vertCount);
                            stores.geom.release(clip.handle);
                            merged = true;
                        } else if (mergedClip.handle) stores.geom.release(mergedClip.handle);
                    }
                }
                if (merged) startIndex++;
                else {
                    stores.debris.appendCenteredPolygon(clip.handle, clip.vertCount);
                    lastStartIdx = startIndex;
                    startIndex++;
                }
            }
        }
    }
    static _shardCountForPolygon(flatVerts, impactForce, apexX, apexY) {
        const area = Math.abs(polygonSignedArea2D(flatVerts));
        const span = FractureEngine._polygonSpan(flatVerts);
        const minArea = FractureEngine.minShardAreaForPolygon(flatVerts);
        const areaCap = Math.max(2, Math.floor(area / minArea));
        const angleCap = Math.floor((Math.PI * 2) / GLASS_MIN_WEDGE_ANGLE);
        const minShardsAllowed = Math.min(4, areaCap);
        let count = Math.max(minShardsAllowed, Math.min(GLASS_MAX_SHARDS_PER_SHATTER, Math.round(span / 8) + Math.floor(impactForce * 0.04)));
        count = Math.min(count, areaCap, angleCap);
        const boundaryDist = FractureEngine._minDistToPolygonBoundary(apexX, apexY, flatVerts);
        const boundaryFactor = Math.min(1, boundaryDist / (span * 0.14));
        count = Math.max(minShardsAllowed, Math.round(count * (0.35 + 0.65 * boundaryFactor)));
        return count;
    }
    static _isGlassFracture(prop) {
        return prop?.strategy?.fracture?.mode === "glass";
    }
    static _isChunkFracture(prop) {
        return prop?.strategy?.fracture?.mode === "chunk";
    }
    static _glassFootprintArea(prop) {
        if (prop.footprintArea != null) return prop.footprintArea;
        const shape = prop.shape;
        if (shape?.type === "Polygon") return Math.abs(polygonSignedArea2D(shape.vertices));
        return 0;
    }
    static _canGlassFractureSplit(prop, minSize) {
        const shape = prop.shape;
        if (shape?.type !== "Polygon") return false;
        const { x, y } = convexFootprintHalfExtents(shape.vertices);
        if (Math.max(x, y) * 2 < minSize) return false;
        const minArea = FractureEngine.minShardAreaForPolygon(shape.vertices) * 2;
        return FractureEngine._glassFootprintArea(prop) >= minArea;
    }
    static _canChunkFractureSplit(prop, minSize) {
        const shape = prop.shape;
        const { x, y } = shape?.type === "Polygon" ? convexFootprintHalfExtents(shape.vertices) : { x: prop.radius, y: prop.radius };
        if (x * 2 < minSize || y * 2 < minSize) return false;
        if (!prop.chunks?.length) return false;
        if (prop.chunks.length > 1) return true;
        return FractureEngine.chunkNeedsMinCellSubdivide(prop.chunks[0]);
    }
    static _ensureChunkFractureGrid(prop) {
        if (prop.chunks?.length !== 1) return;
        const geom = FractureEngine.subdivideSingleChunkAtMinCell(prop.chunks[0]);
        if (geom) FractureEngine.applyPropFractureGeometry(prop, geom);
    }
    static _flatVertsFromShape(prop) {
        return prop.shape.vertices;
    }
    static _clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }
    static _propWorldPosition(prop) {
        const physId = prop._physId;
        return { x: physId !== undefined ? kineticDynamicSlab.x[physId] : prop.x, y: physId !== undefined ? kineticDynamicSlab.y[physId] : prop.y };
    }
    static _currentPropMotion(prop) {
        if (prop.isWallDebris && prop._row >= 0) {
            const row = prop._row;
            return { vx: wallDebrisSlab.vx[row], vy: wallDebrisSlab.vy[row], w: wallDebrisSlab.w[row] };
        }
        const physId = prop._physId;
        if (physId !== undefined) return { vx: kineticDynamicSlab.vx[physId], vy: kineticDynamicSlab.vy[physId], w: kineticDynamicSlab.w[physId] };
        return { vx: prop.vx ?? 0, vy: prop.vy ?? 0, w: prop.angularVelocity ?? 0 };
    }
    static _circleShardCount(impactForce, minShards, maxShards) {
        return FractureEngine._clamp(Math.round(3.5 + impactForce * 0.02), minShards, maxShards);
    }
    static _applyShardBurstImpulse(fracture, frag, geom, random) {
        const cos = Math.cos(fracture.facing);
        const sin = Math.sin(fracture.facing);
        const impactWorld = transformPoint2DInto({ x: 0, y: 0 }, fracture.originX, fracture.originY, fracture.impactLocalX, fracture.impactLocalY, cos, sin);
        const burst = Math.min(FRACTURE_TUNING.burst.maxBurst, FRACTURE_TUNING.burst.baseBurst + fracture.impactForce * FRACTURE_TUNING.burst.burstForceScale);
        const worldPos = transformPoint2DInto({ x: 0, y: 0 }, fracture.originX, fracture.originY, geom.centroid.cx, geom.centroid.cy, cos, sin);
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
    static _spawnBurstFractureShards(world, sourceProp, fracture, shardPropId, stores, spatialFrame = null) {
        const random = FractureEngine._fractureRandomFromImpact(fracture.originX, fracture.originY, fracture.impactForce, 991);
        if (sourceProp.isWallDebris || isWallChunkPropType(shardPropId))
            return world.fractureEngine.wallDebris.spawnShardsFromFracture(
                world,
                sourceProp,
                fracture,
                stores,
                (frag, geom) => {
                    FractureEngine._applyShardBurstImpulse(fracture, frag, geom, random);
                },
                FractureEngine._currentPropMotion(sourceProp),
            );
        return FractureEngine.spawnShardPropsFromDebrisStore(world, sourceProp, fracture, shardPropId, stores, spatialFrame, (frag, geom) => {
            FractureEngine._applyShardBurstImpulse(fracture, frag, geom, random);
        });
    }
    static _spawnGlassShatterShards(world, sourceProp, fracture, spatialFrame = null, stores = moduleStores) {
        return FractureEngine._spawnBurstFractureShards(world, sourceProp, fracture, sourceProp.type, stores, spatialFrame);
    }
    static _spawnChunkFractureShards(world, sourceProp, fracture, spatialFrame = null, stores = moduleStores) {
        return FractureEngine.spawnShardPropsFromDebrisStore(world, sourceProp, fracture, sourceProp.type, stores, spatialFrame);
    }
    static _spawnCircleShatterShards(world, sourceProp, fracture, spatialFrame = null, stores = moduleStores) {
        const shardPropId = sourceProp.type === "snake" || sourceProp.type === "ball" || sourceProp.type === "boid_triangle" ? "snake_shard" : sourceProp.type;
        return FractureEngine._spawnBurstFractureShards(world, sourceProp, fracture, shardPropId, stores, spatialFrame);
    }
    static _splitMeshComponents(cells, localHitX, localHitY, impactForce, forceExplode) {
        if (!cells?.length) return [];
        let components = FractureEngine.splitChunks(cells, localHitX, localHitY, impactForce);
        if (forceExplode && cells.length > 1) components = cells.map((cell) => [cell]);
        return components;
    }
    static _geometryFromChunkComponent(comp, atOrigin) {
        const parts = comp.map((chunk) => ({ vertices: chunk.vertices }));
        return atOrigin ? FractureEngine.buildChunkGeometryAtPropOrigin(parts) : FractureEngine.buildGeometryFromChunkParts(parts);
    }
    static _peelSolidFractureIntoStore(stores, prop, localHitX, localHitY, impactForce) {
        const components = FractureEngine._splitMeshComponents(prop.chunks, localHitX, localHitY, impactForce, false);
        if (components.length <= 1) return null;
        components.sort((a, b) => b.length - a.length);
        const origin = FractureEngine._propWorldPosition(prop);
        const mainGeom = FractureEngine._geometryFromChunkComponent(components[0], false);
        const cos = Math.cos(entityFacing(prop));
        const sin = Math.sin(entityFacing(prop));
        const mainWorldPos = transformPoint2DInto({ x: 0, y: 0 }, origin.x, origin.y, mainGeom.centroid.cx, mainGeom.centroid.cy, cos, sin);
        const physId = prop._physId;
        if (physId !== undefined && physId !== -1) {
            kineticDynamicSlab.x[physId] = mainWorldPos.x;
            kineticDynamicSlab.y[physId] = mainWorldPos.y;
            prop.x = kineticDynamicSlab.x[physId];
            prop.y = kineticDynamicSlab.y[physId];
        } else {
            prop.x = mainWorldPos.x;
            prop.y = mainWorldPos.y;
        }
        const debrisStart = stores.debris.write;
        for (let i = 1; i < components.length; i++) stores.debris.appendChunkGeometry(FractureEngine._geometryFromChunkComponent(components[i], false), 0, 0);
        FractureEngine.applyPropFractureGeometry(prop, mainGeom);
        return { debrisStart, debrisCount: stores.debris.write - debrisStart, originX: origin.x, originY: origin.y, facing: entityFacing(prop) };
    }
    static _fractureImpactContext(prop, worldHitX, worldHitY, impactForce) {
        const origin = FractureEngine._propWorldPosition(prop);
        const impactLocal = FractureEngine.worldHitToPropLocal(prop, worldHitX, worldHitY);
        return { originX: origin.x, originY: origin.y, impactLocalX: impactLocal.x, impactLocalY: impactLocal.y, facing: entityFacing(prop), impactForce };
    }
    static _fractureGlassOnImpact(prop, worldHitX, worldHitY, impactForce, stores) {
        if (!FractureEngine.canFracturePropSplit(prop)) return null;
        const ctx = FractureEngine._fractureImpactContext(prop, worldHitX, worldHitY, impactForce);
        const flatVerts = FractureEngine._flatVertsFromShape(prop);
        const random = FractureEngine._fractureRandomFromImpact(worldHitX, worldHitY, impactForce);
        const parentArea = Math.abs(polygonSignedArea2D(flatVerts));
        const { x: apexX, y: apexY } = FractureEngine._resolveShatterApex(flatVerts, ctx.impactLocalX, ctx.impactLocalY);
        let shardCount = FractureEngine._shardCountForPolygon(flatVerts, impactForce, apexX, apexY);
        let result = FractureEngine._shatterGlassIntoStore(stores, flatVerts, apexX, apexY, shardCount, random);
        const minArea = FractureEngine.minShardAreaForPolygon(flatVerts);
        const areaCap = Math.max(2, Math.floor(parentArea / minArea));
        const minShardsAllowed = Math.min(4, areaCap);
        for (let attempt = 0; attempt < 4; attempt++) {
            const totalArea = stores.debris.totalArea(result.debrisStart, result.debrisCount);
            if (result.debrisCount >= 2 && totalArea >= parentArea * 0.92) break;
            releaseDebrisGeomHandles(stores, result.debrisStart, result.debrisCount);
            stores.debris.write = result.debrisStart;
            shardCount = Math.max(minShardsAllowed, Math.floor(shardCount * 0.72));
            result = FractureEngine._shatterGlassIntoStore(stores, flatVerts, apexX, apexY, shardCount, random);
        }
        if (result.debrisCount < 2) return null;
        return makeFractureDescriptor(stores, { ...ctx, debrisStart: result.debrisStart, debrisCount: result.debrisCount });
    }
    static _fractureChunkOnImpact(prop, worldHitX, worldHitY, impactForce, stores) {
        FractureEngine._ensureChunkFractureGrid(prop);
        if (!FractureEngine.canFracturePropSplit(prop)) return null;
        const ctx = FractureEngine._fractureImpactContext(prop, worldHitX, worldHitY, impactForce);
        const peel = FractureEngine._peelSolidFractureIntoStore(stores, prop, ctx.impactLocalX, ctx.impactLocalY, impactForce);
        if (!peel) return null;
        return makeFractureDescriptor(stores, { ...ctx, debrisStart: peel.debrisStart, debrisCount: peel.debrisCount });
    }
    static _fractureCirclePropOnImpact(prop, worldHitX, worldHitY, impactForce, stores) {
        const ctx = FractureEngine._fractureImpactContext(prop, worldHitX, worldHitY, impactForce);
        const debrisStart = stores.debris.write;
        FractureEngine._buildCircleImpactShardsIntoStore(stores, prop.radius, { x: ctx.impactLocalX, y: ctx.impactLocalY }, impactForce);
        const debrisCount = stores.debris.write - debrisStart;
        if (debrisCount === 0) return null;
        return makeFractureDescriptor(stores, { ...ctx, debrisStart, debrisCount });
    }
    static _prepareEngineScratch(engine, n) {
        if (!engine._splitVisited || engine._splitVisited.length < n) {
            engine._splitVisited = new Uint8Array(n);
            engine._splitHitMask = new Uint8Array(n);
            engine._splitHitVisited = new Uint8Array(n);
            engine._splitQueue = [];
        } else {
            engine._splitVisited.fill(0, 0, n);
            engine._splitHitMask.fill(0, 0, n);
            engine._splitHitVisited.fill(0, 0, n);
            engine._splitQueue.length = 0;
        }
        return { visited: engine._splitVisited, hitMask: engine._splitHitMask, hitVisited: engine._splitHitVisited, queue: engine._splitQueue };
    }
    static _prepareStaticScratch(n) {
        const scratch = FractureEngine._splitScratch;
        if (!scratch.visited || scratch.capacity < n) {
            scratch.visited = new Uint8Array(n);
            scratch.hitMask = new Uint8Array(n);
            scratch.hitVisited = new Uint8Array(n);
            scratch.queue = [];
            scratch.capacity = n;
        } else {
            scratch.visited.fill(0, 0, n);
            scratch.hitMask.fill(0, 0, n);
            scratch.hitVisited.fill(0, 0, n);
            scratch.queue.length = 0;
        }
        return scratch;
    }
    static _splitChunksWithScratch(scratch, chunks, localHitX, localHitY, impactForce) {
        const n = chunks.length;
        const tuning = FRACTURE_TUNING.chunk;
        const damageRadius = impactForce * tuning.damageRadiusScale;
        const damageRadiusSq = damageRadius * damageRadius;
        const chunkProb = impactForce >= tuning.neighborRollHighForceThreshold ? Math.min(1, impactForce / tuning.neighborRollHighForceDivisor) : Math.max(tuning.neighborRollLowForceBase, 1.0 - impactForce * tuning.neighborRollLowForceScale);
        const visited = scratch.visited;
        const hitMask = scratch.hitMask;
        const hitVisited = scratch.hitVisited;
        const queue = scratch.queue;
        let hitIdx = 0;
        let minDistSq = Infinity;
        for (let i = 0; i < n; i++) {
            const chunk = chunks[i];
            const pcx = chunk.cx;
            const pcy = chunk.cy;
            const distSq = (pcx - localHitX) * (pcx - localHitX) + (pcy - localHitY) * (pcy - localHitY);
            if (distSq < minDistSq) {
                minDistSq = distSq;
                hitIdx = i;
            }
            if (distSq <= damageRadiusSq) hitMask[i] = 1;
        }
        if (!hitMask[hitIdx]) hitMask[hitIdx] = 1;
        for (let i = 0; i < n; i++) if (hitMask[i]) visited[i] = 1;
        const components = [];
        for (let i = 0; i < n; i++)
            if (!visited[i]) {
                const comp = [];
                queue.length = 0;
                queue.push(i);
                visited[i] = 1;
                let head = 0;
                while (head < queue.length) {
                    const curr = queue[head++];
                    comp.push(chunks[curr]);
                    const neighbors = chunks[curr].neighbors;
                    for (let j = 0; j < neighbors.length; j++) {
                        const neighbor = neighbors[j];
                        if (!visited[neighbor]) {
                            visited[neighbor] = 1;
                            queue.push(neighbor);
                        }
                    }
                }
                components.push(comp);
            }
        hitVisited.fill(0, 0, n);
        for (let i = 0; i < n; i++)
            if (hitMask[i] && !hitVisited[i]) {
                const chunk = [];
                queue.length = 0;
                queue.push(i);
                hitVisited[i] = 1;
                let head = 0;
                while (head < queue.length) {
                    const curr = queue[head++];
                    chunk.push(chunks[curr]);
                    const neighbors = chunks[curr].neighbors;
                    for (let j = 0; j < neighbors.length; j++) {
                        const neighbor = neighbors[j];
                        if (hitMask[neighbor] && !hitVisited[neighbor])
                            if (FractureEngine._fractureNeighborRoll(localHitX, localHitY, impactForce, neighbor) < chunkProb) {
                                hitVisited[neighbor] = 1;
                                queue.push(neighbor);
                            }
                    }
                }
                components.push(chunk);
            }
        components.sort((a, b) => b.length - a.length);
        if (components.length === 1) return [chunks];
        return components;
    }
}
FractureEngine._splitScratch = { visited: null, hitMask: null, hitVisited: null, queue: null, capacity: 0 };
const FRACTURE_MODES = {
    chunk: { retainParent: true, needsChunkGrid: true, initFootprint: true, onImpact: (prop, worldHitX, worldHitY, impactForce, stores) => FractureEngine._fractureChunkOnImpact(prop, worldHitX, worldHitY, impactForce, stores), spawnShards: (world, sourceProp, fracture, spatialFrame, stores) => FractureEngine._spawnChunkFractureShards(world, sourceProp, fracture, spatialFrame, stores), canSplit: (prop, minSize) => FractureEngine._canChunkFractureSplit(prop, minSize) },
    glass: { retainParent: false, needsChunkGrid: false, initFootprint: false, onImpact: (prop, worldHitX, worldHitY, impactForce, stores) => FractureEngine._fractureGlassOnImpact(prop, worldHitX, worldHitY, impactForce, stores), spawnShards: (world, sourceProp, fracture, spatialFrame, stores) => FractureEngine._spawnGlassShatterShards(world, sourceProp, fracture, spatialFrame, stores), canSplit: (prop, minSize) => FractureEngine._canGlassFractureSplit(prop, minSize) },
    circle: { retainParent: false, skipCanSplit: true, onImpact: (prop, worldHitX, worldHitY, impactForce, stores) => FractureEngine._fractureCirclePropOnImpact(prop, worldHitX, worldHitY, impactForce, stores), spawnShards: (world, sourceProp, fracture, spatialFrame, stores) => FractureEngine._spawnCircleShatterShards(world, sourceProp, fracture, spatialFrame, stores) },
};
// ===== END FRACTURE ENGINE =====
