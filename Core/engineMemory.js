import { MAX_ENTITIES } from "./engineLimits.js";
/** Shared Float32 scratch.
 * Banks: Math 0–63, Phys 64–191, Frac 192–255, Spatial 256–319, Nav 320–399, Bounds 400–419, Render 420–575, Compound 576–831.
 * PHYS layout: +0…78 physics scratch (P_* in physics.js), +79…84 grab (G_*), +85…127 reserved.
 */
export const ENGINE_F32 = new Float32Array(832);
export const ENGINE_U8 = new Uint8Array(256);
export const ENGINE_I32 = new Int32Array(256);
export const ENGINE_MATH_BASE = 0;
export const ENGINE_PHYS_BASE = 64;
export const ENGINE_FRAC_BASE = 192;
export const ENGINE_SPATIAL_BASE = 256;
export const ENGINE_NAV_BASE = 320;
export const ENGINE_BOUNDS_BASE = 400;
export const ENGINE_RENDER_BASE = 420;
export const ENGINE_COMPOUND_BASE = 576;
export const M_VEC_A = ENGINE_MATH_BASE;
export const M_OUT_NX = ENGINE_MATH_BASE + 8;
export const M_OUT_NY = ENGINE_MATH_BASE + 9;
export const M_OUT_LEN = ENGINE_MATH_BASE + 10;
export const M_OUT_CLOSEST_X = ENGINE_MATH_BASE + 11;
export const M_OUT_CLOSEST_Y = ENGINE_MATH_BASE + 12;
export const M_OUT_CLOSEST_T = ENGINE_MATH_BASE + 13;
export const M_OUT_CX = ENGINE_MATH_BASE + 14;
export const M_OUT_CY = ENGINE_MATH_BASE + 15;
export const M_OUT_AREA = ENGINE_MATH_BASE + 16;
export const M_OUT_QW = ENGINE_MATH_BASE + 17;
export const M_OUT_QX = ENGINE_MATH_BASE + 18;
export const M_OUT_QY = ENGINE_MATH_BASE + 19;
export const M_OUT_QZ = ENGINE_MATH_BASE + 20;
export const M_OUT_VX = ENGINE_MATH_BASE + 21;
export const M_OUT_VY = ENGINE_MATH_BASE + 22;
export const M_OUT_VZ = ENGINE_MATH_BASE + 23;
export const S_OUT_XY = ENGINE_SPATIAL_BASE;
export const S_OUT_SCREEN = ENGINE_SPATIAL_BASE + 2;
export const S_AABB = ENGINE_SPATIAL_BASE + 4;
export const S_QUAD = ENGINE_SPATIAL_BASE + 8;
export const S_EDGE_P1X = ENGINE_SPATIAL_BASE + 16;
export const S_EDGE_P1Y = ENGINE_SPATIAL_BASE + 17;
export const S_EDGE_P2X = ENGINE_SPATIAL_BASE + 18;
export const S_EDGE_P2Y = ENGINE_SPATIAL_BASE + 19;
export const N_OUT_XY = ENGINE_NAV_BASE;
export const N_OUT_FLOW = ENGINE_NAV_BASE + 2;
export const N_OUT_STEER = ENGINE_NAV_BASE + 4;
export const B_QUERY = 0;
export const B_CELL = 4;
export const B_FOOTPRINT = 8;
export const B_PAD = 12;
export const B_TMP = 16;
export const R_QUAD_A = ENGINE_RENDER_BASE;
export const R_SUBDIV = ENGINE_RENDER_BASE + 8;
export const R_CAP_CORNERS = ENGINE_RENDER_BASE + 16;
export const R_CAP_UV = ENGINE_RENDER_BASE + 24;
export const R_CAP_SRC = ENGINE_RENDER_BASE + 32;
export const R_CHEVRON = ENGINE_RENDER_BASE + 40;
export const R_FACE_BAND_BOT = ENGINE_RENDER_BASE + 52;
export const R_FACE_BAND_TOP = ENGINE_RENDER_BASE + 56;
export const R_FACE_VISIBLE = 0;
export const MAX_PRISM_FACES = 64;
export const MAX_OUTLINE_VERTS = 64;
export const P_COMPOUND = ENGINE_COMPOUND_BASE;
export const entityX = new Float32Array(MAX_ENTITIES);
export const entityY = new Float32Array(MAX_ENTITIES);
export const entityVx = new Float32Array(MAX_ENTITIES);
export const entityVy = new Float32Array(MAX_ENTITIES);
export const entityW = new Float32Array(MAX_ENTITIES);
export const entityFacing = new Float32Array(MAX_ENTITIES);
export const entityRollQw = new Float32Array(MAX_ENTITIES);
export const entityRollQx = new Float32Array(MAX_ENTITIES);
export const entityRollQy = new Float32Array(MAX_ENTITIES);
export const entityRollQz = new Float32Array(MAX_ENTITIES);
entityRollQw.fill(1);
export const entityR = new Float32Array(MAX_ENTITIES);
export const entityKind = new Uint8Array(MAX_ENTITIES);
export const entityFlags = new Uint32Array(MAX_ENTITIES);
export const entityAlive = new Uint8Array(MAX_ENTITIES);
export const entityGameId = new Int32Array(MAX_ENTITIES).fill(-1);
export const entityRefs = new Array(MAX_ENTITIES);
export const entitySpatialGen = new Uint32Array(MAX_ENTITIES);
export const entityGridTileIdx = new Int32Array(MAX_ENTITIES).fill(-1);
export const MAX_PHYS_BODIES = MAX_ENTITIES;
export const MAX_CONTACTS = MAX_ENTITIES;
export const MAX_KINETIC_PAIRS = MAX_ENTITIES;
export const MAX_KINETIC_CONSTRAINTS = 2048;
export const MAX_ISLAND_GROUPS = 256;
export const WARM_START_CACHE_SIZE = 16384;
export const WARM_START_CACHE_MASK = WARM_START_CACHE_SIZE - 1;
export const PAIR_HASH_CAPACITY = MAX_KINETIC_PAIRS * 2;
export const MAX_KINETIC_DEBRIS = 4096 * 4;
export const MAX_PENDING_WALL_BREAKS = 256;
export const F_OUT_CENTROID_X = ENGINE_FRAC_BASE;
export const F_OUT_CENTROID_Y = ENGINE_FRAC_BASE + 1;
export const F_OUT_AREA = ENGINE_FRAC_BASE + 2;
export const F_OUT_RADIUS = ENGINE_FRAC_BASE + 3;
export const F_OUT_CLOSEST_X = ENGINE_FRAC_BASE + 4;
export const F_OUT_CLOSEST_Y = ENGINE_FRAC_BASE + 5;
export const F_OUT_DEBRIS_START = ENGINE_FRAC_BASE + 6;
export const F_OUT_DEBRIS_COUNT = ENGINE_FRAC_BASE + 7;
export const F_OUT_MOTION_VX = ENGINE_FRAC_BASE + 8;
export const F_OUT_MOTION_VY = ENGINE_FRAC_BASE + 9;
export const F_OUT_MOTION_W = ENGINE_FRAC_BASE + 10;
export const F_OUT_POS_X = ENGINE_FRAC_BASE + 11;
export const F_OUT_POS_Y = ENGINE_FRAC_BASE + 12;
export const F_OUT_REMNANT = ENGINE_FRAC_BASE + 13;
export const F_VEC_A = ENGINE_FRAC_BASE + 14;
export const F_VEC_B = ENGINE_FRAC_BASE + 16;
export const F_VEC_C = ENGINE_FRAC_BASE + 18;
export const F_VEC_D = ENGINE_FRAC_BASE + 20;
export const F_OUT_ORIGIN_X = ENGINE_FRAC_BASE + 22;
export const F_OUT_ORIGIN_Y = ENGINE_FRAC_BASE + 23;
export const F_OUT_FACING = ENGINE_FRAC_BASE + 24;
export const F_OUT_IMPACT_LOCAL_X = ENGINE_FRAC_BASE + 25;
export const F_OUT_IMPACT_LOCAL_Y = ENGINE_FRAC_BASE + 26;
export const F_OUT_IMPACT_FORCE = ENGINE_FRAC_BASE + 27;
export const F_OUT_VORONOI_HANDLE = ENGINE_FRAC_BASE + 28;
export const F_OUT_VORONOI_VERTS = ENGINE_FRAC_BASE + 29;
export const F_EDGE_P1X = ENGINE_FRAC_BASE + 30;
export const F_EDGE_P1Y = ENGINE_FRAC_BASE + 31;
export const F_EDGE_P2X = ENGINE_FRAC_BASE + 32;
export const F_EDGE_P2Y = ENGINE_FRAC_BASE + 33;
export const F_SHATTER_SEEDS = ENGINE_FRAC_BASE + 34;
export const G_WX = ENGINE_PHYS_BASE + 79;
export const G_WY = ENGINE_PHYS_BASE + 80;
export const G_LX = ENGINE_PHYS_BASE + 81;
export const G_LY = ENGINE_PHYS_BASE + 82;
export const G_OX = ENGINE_PHYS_BASE + 83;
export const G_OY = ENGINE_PHYS_BASE + 84;
export function ensureGrowI32(obj, key, minCap, copyLen = -1) {
    const cur = obj[key];
    if (!cur) {
        const next = new Int32Array(Math.max(minCap, 16));
        obj[key] = next;
        return next;
    }
    if (cur.length >= minCap) return cur;
    const next = new Int32Array(Math.max(minCap, cur.length * 2));
    const n = copyLen < 0 ? cur.length : copyLen;
    if (n > 0) next.set(cur.subarray(0, Math.min(n, cur.length)));
    obj[key] = next;
    return next;
}
export function ensureGrowF32(obj, key, minCap, copyLen = -1) {
    const cur = obj[key];
    if (!cur) {
        const next = new Float32Array(Math.max(minCap, 16));
        obj[key] = next;
        return next;
    }
    if (cur.length >= minCap) return cur;
    const next = new Float32Array(Math.max(minCap, cur.length * 2));
    const n = copyLen < 0 ? cur.length : copyLen;
    if (n > 0) next.set(cur.subarray(0, Math.min(n, cur.length)));
    obj[key] = next;
    return next;
}
export function ensureGrowU8(obj, key, minCap, copyLen = -1) {
    const cur = obj[key];
    if (!cur) {
        const next = new Uint8Array(Math.max(minCap, 16));
        obj[key] = next;
        return next;
    }
    if (cur.length >= minCap) return cur;
    const next = new Uint8Array(Math.max(minCap, cur.length * 2));
    const n = copyLen < 0 ? cur.length : copyLen;
    if (n > 0) next.set(cur.subarray(0, Math.min(n, cur.length)));
    obj[key] = next;
    return next;
}
export function ensureGrowU16(obj, key, minCap, copyLen = -1) {
    const cur = obj[key];
    if (!cur) {
        const next = new Uint16Array(Math.max(minCap, 16));
        obj[key] = next;
        return next;
    }
    if (cur.length >= minCap) return cur;
    const next = new Uint16Array(Math.max(minCap, cur.length * 2));
    const n = copyLen < 0 ? cur.length : copyLen;
    if (n > 0) next.set(cur.subarray(0, Math.min(n, cur.length)));
    obj[key] = next;
    return next;
}
export class GrowI32 {
    constructor(initialCap = 256) {
        this.buf = new Int32Array(initialCap);
        this.used = 0;
    }
    ensure(minCap) {
        if (this.buf.length >= minCap) return this.buf;
        const next = new Int32Array(Math.max(minCap, this.buf.length * 2));
        if (this.used > 0) next.set(this.buf.subarray(0, this.used));
        this.buf = next;
        return this.buf;
    }
    clear() {
        this.used = 0;
    }
    push(v) {
        this.ensure(this.used + 1);
        this.buf[this.used++] = v;
    }
}
export class GrowF32 {
    constructor(initialCap = 256) {
        this.buf = new Float32Array(initialCap);
        this.used = 0;
    }
    ensure(minCap) {
        if (this.buf.length >= minCap) return this.buf;
        const next = new Float32Array(Math.max(minCap, this.buf.length * 2));
        if (this.used > 0) next.set(this.buf.subarray(0, this.used));
        this.buf = next;
        return this.buf;
    }
}
export const pickWorldPoly = new GrowF32(64);
const SHAPE_POOL_FLOATS_INIT = MAX_PHYS_BODIES * 16;
const PART_TABLE_INIT = MAX_PHYS_BODIES * 2;
export const kineticDynamicSlab = {
    x: entityX,
    y: entityY,
    vx: entityVx,
    vy: entityVy,
    w: entityW,
    activeSlot: new Int32Array(MAX_PHYS_BODIES),
    activePhysIds: new Int32Array(MAX_PHYS_BODIES),
    activePhysCount: 0,
    islandRoot: new Int32Array(MAX_PHYS_BODIES),
    partCount: new Uint8Array(MAX_PHYS_BODIES),
    shapeKind: new Uint8Array(MAX_PHYS_BODIES),
    linkNeighborOffset: new Int32Array(MAX_PHYS_BODIES),
    linkNeighborCount: new Int32Array(MAX_PHYS_BODIES),
    linkNeighborEids: new Int32Array(256),
    linkNeighborEidsUsed: 0,
    spatialNeighborOffset: new Int32Array(MAX_PHYS_BODIES),
    spatialNeighborCount: new Int32Array(MAX_PHYS_BODIES),
    spatialNeighborEids: new Int32Array(256),
    spatialNeighborEidsUsed: 0,
    r: new Float32Array(MAX_PHYS_BODIES),
    hx: new Float32Array(MAX_PHYS_BODIES),
    hy: new Float32Array(MAX_PHYS_BODIES),
    cos: new Float32Array(MAX_PHYS_BODIES),
    sin: new Float32Array(MAX_PHYS_BODIES),
    partGeomOffset: new Int32Array(MAX_PHYS_BODIES),
    partShapeKind: new Uint8Array(PART_TABLE_INIT),
    partRadius: new Float32Array(PART_TABLE_INIT),
    partVertOffset: new Int32Array(PART_TABLE_INIT),
    partVertFloatCount: new Uint16Array(PART_TABLE_INIT),
    partVertCap: new Uint16Array(PART_TABLE_INIT),
    partTableUsed: 0,
    partRowFree: new Int32Array(64),
    partRowFreeCount: 0,
    shapeVertPool: new Float32Array(SHAPE_POOL_FLOATS_INIT),
    shapeNormPool: new Float32Array(SHAPE_POOL_FLOATS_INIT),
    shapePoolUsed: 0,
    shapePoolFreeOff: new Int32Array(64),
    shapePoolFreeCap: new Int32Array(64),
    shapePoolFreeCount: 0,
};
kineticDynamicSlab.activeSlot.fill(-1);
kineticDynamicSlab.islandRoot.fill(-1);
kineticDynamicSlab.linkNeighborOffset.fill(0);
kineticDynamicSlab.linkNeighborCount.fill(0);
kineticDynamicSlab.spatialNeighborOffset.fill(0);
kineticDynamicSlab.spatialNeighborCount.fill(0);
kineticDynamicSlab.partGeomOffset.fill(-1);
export const kineticStaticSlab = { mass: new Float32Array(MAX_PHYS_BODIES), invMass: new Float32Array(MAX_PHYS_BODIES), invI: new Float32Array(MAX_PHYS_BODIES), entityId: new Int32Array(MAX_PHYS_BODIES), restitution: new Float32Array(MAX_PHYS_BODIES), friction: new Float32Array(MAX_PHYS_BODIES) };
export const kineticConstraintStore = { count: 0, id: new Int32Array(MAX_KINETIC_CONSTRAINTS), type: new Uint8Array(MAX_KINETIC_CONSTRAINTS), bodyAId: new Int32Array(MAX_KINETIC_CONSTRAINTS), bodyBId: new Int32Array(MAX_KINETIC_CONSTRAINTS), physIdA: new Int32Array(MAX_KINETIC_CONSTRAINTS), physIdB: new Int32Array(MAX_KINETIC_CONSTRAINTS), anchorAx: new Float32Array(MAX_KINETIC_CONSTRAINTS), anchorAy: new Float32Array(MAX_KINETIC_CONSTRAINTS), anchorBx: new Float32Array(MAX_KINETIC_CONSTRAINTS), anchorBy: new Float32Array(MAX_KINETIC_CONSTRAINTS), restLength: new Float32Array(MAX_KINETIC_CONSTRAINTS), referenceAngle: new Float32Array(MAX_KINETIC_CONSTRAINTS), accumulatedImpulse: new Float32Array(MAX_KINETIC_CONSTRAINTS) };
export const kineticConstraintSlab = {
    count: 0,
    activeCount: 0,
    groupCount: 0,
    groupCounts: new Int32Array(MAX_ISLAND_GROUPS),
    type: new Uint8Array(MAX_KINETIC_CONSTRAINTS),
    storeRow: new Int32Array(MAX_KINETIC_CONSTRAINTS),
    physIdA: new Int32Array(MAX_KINETIC_CONSTRAINTS),
    physIdB: new Int32Array(MAX_KINETIC_CONSTRAINTS),
    dynamic: { accumulatedImpulse: new Float32Array(MAX_KINETIC_CONSTRAINTS), nx: new Float32Array(MAX_KINETIC_CONSTRAINTS), ny: new Float32Array(MAX_KINETIC_CONSTRAINTS), rAn: new Float32Array(MAX_KINETIC_CONSTRAINTS), rBn: new Float32Array(MAX_KINETIC_CONSTRAINTS), k: new Float32Array(MAX_KINETIC_CONSTRAINTS), error: new Float32Array(MAX_KINETIC_CONSTRAINTS) },
    static: { anchorAx: new Float32Array(MAX_KINETIC_CONSTRAINTS), anchorAy: new Float32Array(MAX_KINETIC_CONSTRAINTS), anchorBx: new Float32Array(MAX_KINETIC_CONSTRAINTS), anchorBy: new Float32Array(MAX_KINETIC_CONSTRAINTS), restLength: new Float32Array(MAX_KINETIC_CONSTRAINTS), referenceAngle: new Float32Array(MAX_KINETIC_CONSTRAINTS), massA: new Float32Array(MAX_KINETIC_CONSTRAINTS), massB: new Float32Array(MAX_KINETIC_CONSTRAINTS), invMassA: new Float32Array(MAX_KINETIC_CONSTRAINTS), invMassB: new Float32Array(MAX_KINETIC_CONSTRAINTS), invIA: new Float32Array(MAX_KINETIC_CONSTRAINTS), invIB: new Float32Array(MAX_KINETIC_CONSTRAINTS), capsuleRadius: new Float32Array(MAX_KINETIC_CONSTRAINTS) },
    reset() {
        this.count = 0;
        this.activeCount = 0;
        this.groupCount = 0;
    },
};
export const kineticContactBuffer = {
    count: 0,
    physIdA: new Int32Array(MAX_CONTACTS),
    physIdB: new Int32Array(MAX_CONTACTS),
    dynamic: { nx: new Float32Array(MAX_CONTACTS), ny: new Float32Array(MAX_CONTACTS), rax: new Float32Array(MAX_CONTACTS), ray: new Float32Array(MAX_CONTACTS), rbx: new Float32Array(MAX_CONTACTS), rby: new Float32Array(MAX_CONTACTS), preDvx: new Float32Array(MAX_CONTACTS), preDvy: new Float32Array(MAX_CONTACTS), rAn: new Float32Array(MAX_CONTACTS), rBn: new Float32Array(MAX_CONTACTS), rAt: new Float32Array(MAX_CONTACTS), rBt: new Float32Array(MAX_CONTACTS), jn: new Float32Array(MAX_CONTACTS), jt: new Float32Array(MAX_CONTACTS), resting: new Uint8Array(MAX_CONTACTS) },
    static: { tier: new Uint8Array(MAX_CONTACTS), invMassA: new Float32Array(MAX_CONTACTS), invMassB: new Float32Array(MAX_CONTACTS), invIA: new Float32Array(MAX_CONTACTS), invIB: new Float32Array(MAX_CONTACTS), kNormal: new Float32Array(MAX_CONTACTS), kTangent: new Float32Array(MAX_CONTACTS), restitution: new Float32Array(MAX_CONTACTS), friction: new Float32Array(MAX_CONTACTS), featureA: new Uint8Array(MAX_CONTACTS), featureB: new Uint8Array(MAX_CONTACTS), warmStartKey: new Float64Array(MAX_CONTACTS) },
    reset() {
        this.count = 0;
    },
};
function createKineticPairBuffer() {
    return {
        count: 0,
        physIdA: new Int32Array(MAX_KINETIC_PAIRS),
        physIdB: new Int32Array(MAX_KINETIC_PAIRS),
        static: { tier: new Uint8Array(MAX_KINETIC_PAIRS) },
        reset() {
            this.count = 0;
        },
    };
}
export const kineticPairBuffer = createKineticPairBuffer();
export const persistedKineticPairBuffer = createKineticPairBuffer();
export const warmStartKeys = new Float64Array(WARM_START_CACHE_SIZE);
export const warmStartGen = new Int32Array(WARM_START_CACHE_SIZE);
export const warmStartJn = new Float32Array(WARM_START_CACHE_SIZE);
export const warmStartJt = new Float32Array(WARM_START_CACHE_SIZE);
export const warmStartState = { generation: 1 };
export const orderSeenPhysIds = new Uint8Array(MAX_PHYS_BODIES);
export const orderUsedItems = new Uint8Array(MAX_KINETIC_CONSTRAINTS);
export const bucketRoots = new Int32Array(MAX_ISLAND_GROUPS);
export const sIslandPhysA = new Int32Array(MAX_KINETIC_CONSTRAINTS);
export const sIslandPhysB = new Int32Array(MAX_KINETIC_CONSTRAINTS);
export const sBucketCounts = new Int32Array(MAX_ISLAND_GROUPS);
export const sBucketStartIdx = new Int32Array(MAX_ISLAND_GROUPS);
export const sBucketFillIdx = new Int32Array(MAX_ISLAND_GROUPS);
export const sIslandAwake = new Int32Array(MAX_ISLAND_GROUPS);
export const orderOrderedIdxs = new Int32Array(MAX_KINETIC_CONSTRAINTS);
export const sleepIslandParent = new Int32Array(MAX_PHYS_BODIES);
export const sleepIslandRank = new Int32Array(MAX_PHYS_BODIES);
export const sleepComponentRoot = new Int32Array(MAX_PHYS_BODIES);
export const sleepComponentMaxSpeedSq = new Float32Array(MAX_PHYS_BODIES);
export const sleepComponentHasBlocker = new Uint8Array(MAX_PHYS_BODIES);
export const sleepComponentMemberCount = new Int32Array(MAX_PHYS_BODIES);
export const sleepNeighborEids = new GrowI32(256);
export const pairHashKeys = new Float64Array(PAIR_HASH_CAPACITY);
export const pairHashGen = new Int32Array(PAIR_HASH_CAPACITY);
export const pairHashState = { generation: 1 };
export const entityNext = new Int32Array(MAX_ENTITIES).fill(-1);
export const kineticDebrisSlab = { activeCount: 0, ageMs: new Float32Array(MAX_KINETIC_DEBRIS), alpha: new Float32Array(MAX_KINETIC_DEBRIS) };
export const pendingWallBreaks = { count: 0, keyToRow: new Map(), kind: new Uint8Array(MAX_PENDING_WALL_BREAKS), idx: new Int32Array(MAX_PENDING_WALL_BREAKS), side: new Int8Array(MAX_PENDING_WALL_BREAKS), strength: new Float32Array(MAX_PENDING_WALL_BREAKS), contactX: new Float32Array(MAX_PENDING_WALL_BREAKS), contactY: new Float32Array(MAX_PENDING_WALL_BREAKS), normalX: new Float32Array(MAX_PENDING_WALL_BREAKS), normalY: new Float32Array(MAX_PENDING_WALL_BREAKS), sourceSpeed: new Float32Array(MAX_PENDING_WALL_BREAKS), sourceMass: new Float32Array(MAX_PENDING_WALL_BREAKS) };
export const wallSpawnScratch = { count: 0, kind: new Uint8Array(MAX_PENDING_WALL_BREAKS), idx: new Int32Array(MAX_PENDING_WALL_BREAKS), side: new Int8Array(MAX_PENDING_WALL_BREAKS), x: new Float32Array(MAX_PENDING_WALL_BREAKS), y: new Float32Array(MAX_PENDING_WALL_BREAKS), angle: new Float32Array(MAX_PENDING_WALL_BREAKS), width: new Float32Array(MAX_PENDING_WALL_BREAKS), height: new Float32Array(MAX_PENDING_WALL_BREAKS), wallHeight: new Float32Array(MAX_PENDING_WALL_BREAKS), profileId: new Array(MAX_PENDING_WALL_BREAKS), strength: new Float32Array(MAX_PENDING_WALL_BREAKS), contactX: new Float32Array(MAX_PENDING_WALL_BREAKS), contactY: new Float32Array(MAX_PENDING_WALL_BREAKS), normalX: new Float32Array(MAX_PENDING_WALL_BREAKS), normalY: new Float32Array(MAX_PENDING_WALL_BREAKS), sourceSpeed: new Float32Array(MAX_PENDING_WALL_BREAKS), sourceMass: new Float32Array(MAX_PENDING_WALL_BREAKS) };
export const MAX_STATIC_WALL_SEGMENTS = 4096;
export const staticWallSegmentSlab = { count: 0, x: new Float32Array(MAX_STATIC_WALL_SEGMENTS), y: new Float32Array(MAX_STATIC_WALL_SEGMENTS), angle: new Float32Array(MAX_STATIC_WALL_SEGMENTS), width: new Float32Array(MAX_STATIC_WALL_SEGMENTS), height: new Float32Array(MAX_STATIC_WALL_SEGMENTS), size: new Float32Array(MAX_STATIC_WALL_SEGMENTS), gridIdx: new Int32Array(MAX_STATIC_WALL_SEGMENTS), gridSide: new Uint8Array(MAX_STATIC_WALL_SEGMENTS), flags: new Uint8Array(MAX_STATIC_WALL_SEGMENTS) };
export function resetStaticWallSegmentSlab() {
    staticWallSegmentSlab.count = 0;
}
export function allocStaticWallSegment() {
    const id = staticWallSegmentSlab.count;
    if (id >= MAX_STATIC_WALL_SEGMENTS) throw new Error("static wall segment slab capacity exceeded");
    staticWallSegmentSlab.count = id + 1;
    return id;
}
export const SPRITE_CACHE_PROP_INIT = 2560;
export const SPRITE_CACHE_GRID_INIT = 512;
export const SPRITE_CACHE_OVERLAY_INIT = 1024;
export function createSpriteCacheSlab(capacity) {
    const hashCap = 1 << (32 - Math.clz32(Math.max(8, capacity * 2 - 1)));
    const slab = { capacity, maxLive: capacity, liveCount: 0, lruHead: -1, lruTail: -1, keyLo: new Uint32Array(capacity), keyHi: new Uint32Array(capacity), bakeScale: new Float32Array(capacity), anchorX: new Float32Array(capacity), anchorY: new Float32Array(capacity), drawW: new Float32Array(capacity), drawH: new Float32Array(capacity), flags: new Uint8Array(capacity), frameCount: new Uint16Array(capacity), frameWidthCanvas: new Uint16Array(capacity), lruPrev: new Int32Array(capacity), lruNext: new Int32Array(capacity), slotGen: new Uint32Array(capacity), hashTable: new Int32Array(hashCap), hashCap, keys: new Array(capacity), handles: new Array(capacity), freeSlots: new Int32Array(capacity), freeCount: 0 };
    slab.lruPrev.fill(-1);
    slab.lruNext.fill(-1);
    slab.hashTable.fill(-1);
    for (let i = 0; i < capacity; i++) slab.freeSlots[slab.freeCount++] = capacity - 1 - i;
    return slab;
}
export const propSpriteCacheSlab = createSpriteCacheSlab(SPRITE_CACHE_PROP_INIT);
export const gridStampSpriteCacheSlab = createSpriteCacheSlab(SPRITE_CACHE_GRID_INIT);
export const overlaySpriteCacheSlab = createSpriteCacheSlab(SPRITE_CACHE_OVERLAY_INIT);
export const I_SPRITE_KEY_LO = 64;
export const I_SPRITE_KEY_HI = 65;
export const R_SPRITE_BAKE_SCALE = ENGINE_RENDER_BASE + 60;
export const R_SPRITE_ANCHOR_X = ENGINE_RENDER_BASE + 61;
export const R_SPRITE_ANCHOR_Y = ENGINE_RENDER_BASE + 62;
export const R_SPRITE_DRAW_W = ENGINE_RENDER_BASE + 63;
export const R_SPRITE_DRAW_H = ENGINE_RENDER_BASE + 64;
export const R_SPRITE_FRAME_COUNT = ENGINE_RENDER_BASE + 65;
export const R_SPRITE_FRAME_WIDTH = ENGINE_RENDER_BASE + 66;
export const WALL_FACE_DRAW_MEMO_INIT = 2048;
export const WALL_FACE_ATLAS_MISS = -1;
export const WALL_FACE_ATLAS_SOLID = -2;
export const WALL_FACE_SUBDIV_NONE = -3;
export function createWallFaceDrawMemoSlab(capacity) {
    const hashCap = 1 << (32 - Math.clz32(Math.max(8, capacity * 2 - 1)));
    const slab = { capacity, liveCount: 0, wallRev: -1, surfRev: -1, memoKey: new Int32Array(capacity), camKey: new Int32Array(capacity), perspKey: new Int32Array(capacity), subdivX: new Int32Array(capacity), subdivY: new Int32Array(capacity), capPx: new Float32Array(capacity), alphaBase: new Float32Array(capacity), alphaBandMax: new Float32Array(capacity), capHeight: new Float32Array(capacity), bandHeight: new Float32Array(capacity), wallBaseZ: new Float32Array(capacity), edgeLen: new Float32Array(capacity), wallCx: new Float32Array(capacity), wallCy: new Float32Array(capacity), handles: new Array(capacity), hashTable: new Int32Array(hashCap), hashCap, freeSlots: new Int32Array(capacity), freeCount: 0 };
    slab.hashTable.fill(-1);
    for (let i = 0; i < capacity; i++) slab.freeSlots[slab.freeCount++] = capacity - 1 - i;
    return slab;
}
export function clearWallFaceDrawMemoSlab(slab) {
    for (let i = 0; i < slab.capacity; i++) slab.handles[i] = null;
    slab.liveCount = 0;
    slab.freeCount = 0;
    for (let i = 0; i < slab.capacity; i++) slab.freeSlots[slab.freeCount++] = slab.capacity - 1 - i;
    slab.hashTable.fill(-1);
}
export const wallFaceDrawMemoSlab = createWallFaceDrawMemoSlab(WALL_FACE_DRAW_MEMO_INIT);
