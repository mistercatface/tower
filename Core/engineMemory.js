import { MAX_ENTITIES } from "./engineLimits.js";
// --- Shared scratch buffers ---
/** Shared Float32 scratch.
 * Banks: Math 0–63, Phys 64–191, Frac 192–255, Spatial 256–319, Nav 320–399, Bounds 400–419, Render 420–575, Compound 576–831.
 * PHYS: +0…78 P_* scratch, +79…84 G_* grab, +85…92 P_WALL_VERTS, +93…100 P_WALL_NORMS, +101…127 reserved.
 * Note: P_AABB_C is 4 floats at PHYS+4; P_VEC_C is the same base (+0/+1 only for 2-vecs).
 * P_VEC_D is PHYS+6 and aliases P_AABB_C+2/+3 — do not use P_VEC_D while an AABB occupies P_AABB_C.
 * PHYS +35…+38 reserved (between P_OUT_SOLVE_REST and P_OUT_SWEEP_T).
 * FRAC +11…+12 reserved (between F_OUT_MOTION_W and F_OUT_REMNANT).
 * ENGINE_U8: U8_FACE_VISIBLE at 0…MAX_PRISM_FACES-1; compound hit marks share low U8.
 * ENGINE_I32: I_SPRITE_KEY_* sprite cache key scratch.
 * viewBoundsBuf: session camera SoA (not ENGINE_F32 Bounds bank) — VIEW_TIER_* offsets.
 * All ENGINE_F32 bank slot consts live here; Libraries may keep subarray views only.
 * Modes (WALL_FACE_*, SURFACE_MASK_*, BLEND_MODE_*, COORD_SPACE_*, …) live in engineEnums.js.
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
// --- Math M_* ---
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
// --- Phys P_* (+ G_* grab, wall box scratch) ---
export const P_VEC_A = ENGINE_PHYS_BASE;
export const P_VEC_B = ENGINE_PHYS_BASE + 2;
export const P_VEC_C = ENGINE_PHYS_BASE + 4;
export const P_AABB_C = ENGINE_PHYS_BASE + 4;
export const P_VEC_D = ENGINE_PHYS_BASE + 6;
export const P_AABB_A = ENGINE_PHYS_BASE + 8;
export const P_OUT_MASS_AREA = ENGINE_PHYS_BASE + 16;
export const P_OUT_MASS_CX = ENGINE_PHYS_BASE + 17;
export const P_OUT_MASS_CY = ENGINE_PHYS_BASE + 18;
export const P_OUT_MASS_INERTIA = ENGINE_PHYS_BASE + 19;
export const P_OUT_RAY_ENTER = ENGINE_PHYS_BASE + 20;
export const P_OUT_RAY_EXIT = ENGINE_PHYS_BASE + 21;
export const P_OUT_RAY_NX = ENGINE_PHYS_BASE + 22;
export const P_OUT_RAY_NY = ENGINE_PHYS_BASE + 23;
export const P_OUT_PEN_NX = ENGINE_PHYS_BASE + 24;
export const P_OUT_PEN_NY = ENGINE_PHYS_BASE + 25;
export const P_OUT_PEN_OVERLAP = ENGINE_PHYS_BASE + 26;
export const P_OUT_PEN_DIST_SQ = ENGINE_PHYS_BASE + 27;
export const P_OUT_DIST_X = ENGINE_PHYS_BASE + 28;
export const P_OUT_DIST_Y = ENGINE_PHYS_BASE + 29;
export const P_OUT_DIST_T = ENGINE_PHYS_BASE + 30;
export const P_OUT_DIST_DIST = ENGINE_PHYS_BASE + 31;
export const P_OUT_SOLVE_ITERS = ENGINE_PHYS_BASE + 32;
export const P_OUT_SOLVE_IMPULSE = ENGINE_PHYS_BASE + 33;
export const P_OUT_SOLVE_REST = ENGINE_PHYS_BASE + 34;
// PHYS +35…+38 reserved
export const P_OUT_SWEEP_T = ENGINE_PHYS_BASE + 39;
export const P_OUT_SWEEP_X = ENGINE_PHYS_BASE + 40;
export const P_OUT_SWEEP_Y = ENGINE_PHYS_BASE + 41;
export const P_SAT = ENGINE_PHYS_BASE + 42;
export const P_CLIP_X = ENGINE_PHYS_BASE + 67;
export const P_CLIP_Y = ENGINE_PHYS_BASE + 71;
export const P_PROJ_A = ENGINE_PHYS_BASE + 75;
export const P_PROJ_B = ENGINE_PHYS_BASE + 77;
export const G_WX = ENGINE_PHYS_BASE + 79;
export const G_WY = ENGINE_PHYS_BASE + 80;
export const G_LX = ENGINE_PHYS_BASE + 81;
export const G_LY = ENGINE_PHYS_BASE + 82;
export const G_OX = ENGINE_PHYS_BASE + 83;
export const G_OY = ENGINE_PHYS_BASE + 84;
export const P_WALL_VERTS = ENGINE_PHYS_BASE + 85;
export const P_WALL_NORMS = ENGINE_PHYS_BASE + 93;
// --- Frac F_* ---
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
// FRAC +11…+12 reserved
export const F_OUT_REMNANT = ENGINE_FRAC_BASE + 13;
export const F_VEC_A = ENGINE_FRAC_BASE + 14;
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
// --- Spatial S_* ---
export const S_OUT_XY = ENGINE_SPATIAL_BASE;
export const S_OUT_SCREEN = ENGINE_SPATIAL_BASE + 2;
export const S_AABB = ENGINE_SPATIAL_BASE + 4;
export const S_QUAD = ENGINE_SPATIAL_BASE + 8;
export const S_EDGE_P1X = ENGINE_SPATIAL_BASE + 16;
export const S_EDGE_P1Y = ENGINE_SPATIAL_BASE + 17;
export const S_EDGE_P2X = ENGINE_SPATIAL_BASE + 18;
export const S_EDGE_P2Y = ENGINE_SPATIAL_BASE + 19;
// --- Nav N_* ---
export const N_OUT_XY = ENGINE_NAV_BASE;
export const N_OUT_FLOW = ENGINE_NAV_BASE + 2;
export const N_OUT_STEER = ENGINE_NAV_BASE + 4;
// --- Bounds B_* (relative offsets only — always index as ENGINE_F32[ENGINE_BOUNDS_BASE + B_*]) ---
export const B_QUERY = 0;
export const B_CELL = 4;
export const B_FOOTPRINT = 8;
export const B_PAD = 12;
export const B_TMP = 16;
// --- Render R_* ---
export const R_QUAD_A = ENGINE_RENDER_BASE;
export const R_SUBDIV = ENGINE_RENDER_BASE + 8;
export const R_CAP_CORNERS = ENGINE_RENDER_BASE + 16;
export const R_CAP_UV = ENGINE_RENDER_BASE + 24;
export const R_CAP_SRC = ENGINE_RENDER_BASE + 32;
export const R_CHEVRON = ENGINE_RENDER_BASE + 40;
export const R_FACE_BAND_BOT = ENGINE_RENDER_BASE + 52;
export const R_FACE_BAND_TOP = ENGINE_RENDER_BASE + 56;
export const R_SPRITE_BAKE_SCALE = ENGINE_RENDER_BASE + 60;
export const R_SPRITE_ANCHOR_X = ENGINE_RENDER_BASE + 61;
export const R_SPRITE_ANCHOR_Y = ENGINE_RENDER_BASE + 62;
export const R_SPRITE_DRAW_W = ENGINE_RENDER_BASE + 63;
export const R_SPRITE_DRAW_H = ENGINE_RENDER_BASE + 64;
export const R_SPRITE_FRAME_COUNT = ENGINE_RENDER_BASE + 65;
export const R_SPRITE_FRAME_WIDTH = ENGINE_RENDER_BASE + 66;
export const U8_FACE_VISIBLE = 0;
export const MAX_PRISM_FACES = 64;
export const MAX_OUTLINE_VERTS = 64;
// --- Compound ---
export const P_COMPOUND = ENGINE_COMPOUND_BASE;
// --- I32 scratch ---
export const I_SPRITE_KEY_LO = 64;
export const I_SPRITE_KEY_HI = 65;
// --- Entity SoA (indexed by physId / entity slot) ---
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
export const entityAgeMs = new Float32Array(MAX_ENTITIES);
export const entityKind = new Uint8Array(MAX_ENTITIES);
export const entityFlags = new Uint32Array(MAX_ENTITIES);
export const entityAlive = new Uint8Array(MAX_ENTITIES);
export const entityGameId = new Int32Array(MAX_ENTITIES).fill(-1);
export const entityRefs = new Array(MAX_ENTITIES); // JS body / prop object per slot
export const entitySpatialGen = new Uint32Array(MAX_ENTITIES);
export const entityGridTileIdx = new Int32Array(MAX_ENTITIES).fill(-1);
// --- Camera view bounds (session SoA; not ENGINE_F32 scratch) ---
export const VIEW_TIER_CLIP = 0;
export const VIEW_TIER_PROPS = 4;
export const VIEW_TIER_STRUCTURE = 8;
export const VIEW_TIER_CHUNKS = 12;
export const VIEW_TIER_COUNT = 4;
export const VIEW_BOUNDS_PROPS_PAD_PX = 20;
export const viewBoundsBuf = new Float32Array(VIEW_TIER_COUNT * 4);
export const viewBoundsPad = new Float32Array(VIEW_TIER_COUNT);
viewBoundsPad[1] = VIEW_BOUNDS_PROPS_PAD_PX;
export function configureViewBoundsPads(viewQueryPadPx, viewPaddingPx) {
    if (viewBoundsPad[2] === viewQueryPadPx && viewBoundsPad[3] === viewPaddingPx) return false;
    viewBoundsPad[2] = viewQueryPadPx;
    viewBoundsPad[3] = viewPaddingPx;
    return true;
}
export function recomputeViewBounds(centerX, centerY, halfW, halfH) {
    for (let i = 0; i < VIEW_TIER_COUNT; i++) {
        const o = i * 4;
        const pad = viewBoundsPad[i];
        viewBoundsBuf[o] = centerX - halfW - pad;
        viewBoundsBuf[o + 1] = centerY - halfH - pad;
        viewBoundsBuf[o + 2] = centerX + halfW + pad;
        viewBoundsBuf[o + 3] = centerY + halfH + pad;
    }
}
export function circleInViewBounds(worldX, worldY, radius = 0, tierO = VIEW_TIER_PROPS) {
    const half = radius / 2;
    const minX = worldX - half;
    const minY = worldY - half;
    const maxX = worldX + half;
    const maxY = worldY + half;
    return !(maxX < minX || maxY < minY || minX > viewBoundsBuf[tierO + 2] || maxX < viewBoundsBuf[tierO] || minY > viewBoundsBuf[tierO + 3] || maxY < viewBoundsBuf[tierO + 1]);
}
// --- Physics capacity / open-address hash caps ---
export const MAX_PHYS_BODIES = MAX_ENTITIES;
export const MAX_CONTACTS = MAX_ENTITIES;
export const MAX_KINETIC_PAIRS = MAX_ENTITIES;
export const MAX_KINETIC_CONSTRAINTS = 2048;
export const MAX_ISLAND_GROUPS = 256;
export const WARM_START_CACHE_SIZE = 16384;
export const WARM_START_CACHE_MASK = WARM_START_CACHE_SIZE - 1; // power-of-two probe mask
export const PAIR_HASH_CAPACITY = MAX_KINETIC_PAIRS * 2; // open-address pair presence table
export const MAX_KINETIC_DEBRIS = 4096 * 4;
export const MAX_PENDING_WALL_BREAKS = 256;
export const PENDING_BREAK_HASH_CAPACITY = MAX_PENDING_WALL_BREAKS * 2;
export const PENDING_BREAK_HASH_MASK = PENDING_BREAK_HASH_CAPACITY - 1; // power-of-two probe mask
export const MAX_DEFERRED_FRACTURES = 256;
export const MAX_STATIC_WALL_SEGMENTS = 4096;
// --- Grow helpers (resizable typed lists / slab column grow) ---
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
// --- Kinetic slabs (dynamic aliases entity XYVW; static / constraints / contacts / pairs) ---
const SHAPE_POOL_FLOATS_INIT = MAX_PHYS_BODIES * 16;
const PART_TABLE_INIT = MAX_PHYS_BODIES * 2;
export const kineticDynamicSlab = {
    // x/y/vx/vy/w share entity* SoA columns
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
    sleeping: new Uint8Array(MAX_PHYS_BODIES),
    sleepFrames: new Uint16Array(MAX_PHYS_BODIES),
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
kineticDynamicSlab.sleeping.fill(0);
kineticDynamicSlab.sleepFrames.fill(0);
export const kineticStaticSlab = { mass: new Float32Array(MAX_PHYS_BODIES), invMass: new Float32Array(MAX_PHYS_BODIES), invI: new Float32Array(MAX_PHYS_BODIES), entityId: new Int32Array(MAX_PHYS_BODIES), restitution: new Float32Array(MAX_PHYS_BODIES), friction: new Float32Array(MAX_PHYS_BODIES) };
export const primitivePhysics = { density: new Float32Array([0.007958, 1.5 / 256]), dragFriction: new Float32Array([4, 8]), wallRestitution: new Float32Array([0.35, 0.15]), wallFriction: new Float32Array([0.4, 0.8]) };
export const kineticConstraintStore = { count: 0, id: new Int32Array(MAX_KINETIC_CONSTRAINTS), type: new Uint8Array(MAX_KINETIC_CONSTRAINTS), bodyAId: new Int32Array(MAX_KINETIC_CONSTRAINTS), bodyBId: new Int32Array(MAX_KINETIC_CONSTRAINTS), physIdA: new Int32Array(MAX_KINETIC_CONSTRAINTS), physIdB: new Int32Array(MAX_KINETIC_CONSTRAINTS), anchorAx: new Float32Array(MAX_KINETIC_CONSTRAINTS), anchorAy: new Float32Array(MAX_KINETIC_CONSTRAINTS), anchorBx: new Float32Array(MAX_KINETIC_CONSTRAINTS), anchorBy: new Float32Array(MAX_KINETIC_CONSTRAINTS), restLength: new Float32Array(MAX_KINETIC_CONSTRAINTS), referenceAngle: new Float32Array(MAX_KINETIC_CONSTRAINTS), accumulatedImpulse: new Float32Array(MAX_KINETIC_CONSTRAINTS) }; // persistent constraint rows
export const kineticConstraintSlab = {
    // per-tick gathered active constraints + island groups
    count: 0,
    activeCount: 0,
    groupCount: 0,
    groupCounts: new Int32Array(MAX_ISLAND_GROUPS),
    type: new Uint8Array(MAX_KINETIC_CONSTRAINTS),
    storeRow: new Int32Array(MAX_KINETIC_CONSTRAINTS),
    physIdA: new Int32Array(MAX_KINETIC_CONSTRAINTS),
    physIdB: new Int32Array(MAX_KINETIC_CONSTRAINTS),
    dynamic: { accumulatedImpulse: new Float32Array(MAX_KINETIC_CONSTRAINTS), nx: new Float32Array(MAX_KINETIC_CONSTRAINTS), ny: new Float32Array(MAX_KINETIC_CONSTRAINTS), rAn: new Float32Array(MAX_KINETIC_CONSTRAINTS), rBn: new Float32Array(MAX_KINETIC_CONSTRAINTS), k: new Float32Array(MAX_KINETIC_CONSTRAINTS), error: new Float32Array(MAX_KINETIC_CONSTRAINTS) },
    static: { anchorAx: new Float32Array(MAX_KINETIC_CONSTRAINTS), anchorAy: new Float32Array(MAX_KINETIC_CONSTRAINTS), anchorBx: new Float32Array(MAX_KINETIC_CONSTRAINTS), anchorBy: new Float32Array(MAX_KINETIC_CONSTRAINTS), restLength: new Float32Array(MAX_KINETIC_CONSTRAINTS), referenceAngle: new Float32Array(MAX_KINETIC_CONSTRAINTS), invMassA: new Float32Array(MAX_KINETIC_CONSTRAINTS), invMassB: new Float32Array(MAX_KINETIC_CONSTRAINTS), invIA: new Float32Array(MAX_KINETIC_CONSTRAINTS), invIB: new Float32Array(MAX_KINETIC_CONSTRAINTS), capsuleRadius: new Float32Array(MAX_KINETIC_CONSTRAINTS) },
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
export const persistedKineticPairBuffer = createKineticPairBuffer(); // survives substep compaction for warm-start keys
// --- Contact warm-start cache (open-address; bump generation to clear) ---
export const warmStartKeys = new Float64Array(WARM_START_CACHE_SIZE);
export const warmStartGen = new Int32Array(WARM_START_CACHE_SIZE);
export const warmStartJn = new Float32Array(WARM_START_CACHE_SIZE);
export const warmStartJt = new Float32Array(WARM_START_CACHE_SIZE);
export const warmStartState = { generation: 1 }; // bump to clear; wrap resets gen column
// --- Constraint island gather / sleep scratch ---
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
export const orderUniquePhysIds = new GrowI32(64);
export const orderOrdered = new GrowI32(64);
export const islandLinkWallSegSeen = new Uint8Array(MAX_STATIC_WALL_SEGMENTS);
export let islandLinkWallSegGen = 1;
export function clearIslandLinkWallSegSeen() {
    islandLinkWallSegGen++;
    if (islandLinkWallSegGen > 255) {
        islandLinkWallSegSeen.fill(0);
        islandLinkWallSegGen = 1;
    }
}
export const sleepIslandParent = new Int32Array(MAX_PHYS_BODIES);
export const sleepIslandRank = new Int32Array(MAX_PHYS_BODIES);
export const sleepComponentRoot = new Int32Array(MAX_PHYS_BODIES);
export const sleepComponentMaxSpeedSq = new Float32Array(MAX_PHYS_BODIES);
export const sleepComponentHasBlocker = new Uint8Array(MAX_PHYS_BODIES);
export const sleepComponentMemberCount = new Int32Array(MAX_PHYS_BODIES);
export const sleepNeighborEids = new GrowI32(256);
// --- Open-address pair hash (kinetic pair patch) ---
export const pairHashKeys = new Float64Array(PAIR_HASH_CAPACITY);
export const pairHashGen = new Int32Array(PAIR_HASH_CAPACITY);
export const pairHashState = { generation: 1 }; // bump to clear; wrap resets gen column
// --- Debris / deferred fracture / pending wall breaks ---
export const entityNext = new Int32Array(MAX_ENTITIES).fill(-1); // freelist / linked occupancy
export const kineticDebrisSlab = { activeCount: 0, ageMs: new Float32Array(MAX_KINETIC_DEBRIS), alpha: new Float32Array(MAX_KINETIC_DEBRIS) };
export const deferredFractureSlab = { count: 0, propRef: new Array(MAX_DEFERRED_FRACTURES), debrisStart: new Int32Array(MAX_DEFERRED_FRACTURES), debrisCount: new Int32Array(MAX_DEFERRED_FRACTURES), originX: new Float32Array(MAX_DEFERRED_FRACTURES), originY: new Float32Array(MAX_DEFERRED_FRACTURES), facing: new Float32Array(MAX_DEFERRED_FRACTURES), impactLocalX: new Float32Array(MAX_DEFERRED_FRACTURES), impactLocalY: new Float32Array(MAX_DEFERRED_FRACTURES), impactForce: new Float32Array(MAX_DEFERRED_FRACTURES), remnant: new Uint8Array(MAX_DEFERRED_FRACTURES) };
export function resetDeferredFractureSlab() {
    const slab = deferredFractureSlab;
    const n = slab.count;
    for (let i = 0; i < n; i++) slab.propRef[i] = null;
    slab.count = 0;
}
export const pendingWallBreaks = { count: 0, kind: new Uint8Array(MAX_PENDING_WALL_BREAKS), idx: new Int32Array(MAX_PENDING_WALL_BREAKS), side: new Int8Array(MAX_PENDING_WALL_BREAKS), strength: new Float32Array(MAX_PENDING_WALL_BREAKS), contactX: new Float32Array(MAX_PENDING_WALL_BREAKS), contactY: new Float32Array(MAX_PENDING_WALL_BREAKS), normalX: new Float32Array(MAX_PENDING_WALL_BREAKS), normalY: new Float32Array(MAX_PENDING_WALL_BREAKS), sourceSpeed: new Float32Array(MAX_PENDING_WALL_BREAKS), sourceMass: new Float32Array(MAX_PENDING_WALL_BREAKS) };
export const pendingBreakHashKeys = new Int32Array(PENDING_BREAK_HASH_CAPACITY);
export const pendingBreakHashRows = new Int32Array(PENDING_BREAK_HASH_CAPACITY); // key → pending row
export const pendingBreakHashGen = new Int32Array(PENDING_BREAK_HASH_CAPACITY);
let pendingBreakHashGeneration = 1;
export function clearPendingBreakHash() {
    pendingBreakHashGeneration++;
    if (pendingBreakHashGeneration > 0x7fffffff) {
        pendingBreakHashGen.fill(0);
        pendingBreakHashGeneration = 1;
    }
}
export function pendingBreakRowForKey(key) {
    const generation = pendingBreakHashGeneration;
    let idx = (key >>> 0) & PENDING_BREAK_HASH_MASK;
    for (let n = 0; n < PENDING_BREAK_HASH_CAPACITY; n++) {
        if (pendingBreakHashGen[idx] !== generation) return -1;
        if (pendingBreakHashKeys[idx] === key) return pendingBreakHashRows[idx];
        idx = (idx + 1) & PENDING_BREAK_HASH_MASK;
    }
    return -1;
}
export function insertPendingBreakKey(key, row) {
    const generation = pendingBreakHashGeneration;
    let idx = (key >>> 0) & PENDING_BREAK_HASH_MASK;
    for (let n = 0; n < PENDING_BREAK_HASH_CAPACITY; n++) {
        if (pendingBreakHashGen[idx] !== generation) {
            pendingBreakHashKeys[idx] = key;
            pendingBreakHashRows[idx] = row;
            pendingBreakHashGen[idx] = generation;
            return;
        }
        if (pendingBreakHashKeys[idx] === key) {
            pendingBreakHashRows[idx] = row;
            return;
        }
        idx = (idx + 1) & PENDING_BREAK_HASH_MASK;
    }
    throw new Error("pending break hash capacity exceeded");
}
export const wallSpawnScratch = { count: 0, kind: new Uint8Array(MAX_PENDING_WALL_BREAKS), idx: new Int32Array(MAX_PENDING_WALL_BREAKS), side: new Int8Array(MAX_PENDING_WALL_BREAKS), x: new Float32Array(MAX_PENDING_WALL_BREAKS), y: new Float32Array(MAX_PENDING_WALL_BREAKS), angle: new Float32Array(MAX_PENDING_WALL_BREAKS), width: new Float32Array(MAX_PENDING_WALL_BREAKS), height: new Float32Array(MAX_PENDING_WALL_BREAKS), wallHeight: new Float32Array(MAX_PENDING_WALL_BREAKS), profileId: new Array(MAX_PENDING_WALL_BREAKS), strength: new Float32Array(MAX_PENDING_WALL_BREAKS), contactX: new Float32Array(MAX_PENDING_WALL_BREAKS), contactY: new Float32Array(MAX_PENDING_WALL_BREAKS), normalX: new Float32Array(MAX_PENDING_WALL_BREAKS), normalY: new Float32Array(MAX_PENDING_WALL_BREAKS), sourceSpeed: new Float32Array(MAX_PENDING_WALL_BREAKS), sourceMass: new Float32Array(MAX_PENDING_WALL_BREAKS) };
// --- Static wall segments (broadphase SAT sources) ---
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
// --- Sprite cache slabs ---
const SPRITE_CACHE_PROP_INIT = 2560;
const SPRITE_CACHE_GRID_INIT = 512;
const SPRITE_CACHE_OVERLAY_INIT = 1024;
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
// --- Wall-face draw memo (atlas + subdiv) ---
// Columns: memoKey/camKey/perspKey; subdivX/Y, capPx, alphaBase/alphaBandMax;
// geom: capHeight, bandHeight, wallBaseZ, edgeLen, wallCx/Cy;
// atlas: atlasWx1/Wy1/Wx2/Wy2, atlasRev, atlasSeed, atlasWallHeightKey, atlasProfileHash;
// handles[] = canvas arrays; hashTable/freeSlots for open-address reuse.
const WALL_FACE_DRAW_MEMO_INIT = 2048;
function createWallFaceDrawMemoSlab(capacity) {
    const hashCap = 1 << (32 - Math.clz32(Math.max(8, capacity * 2 - 1)));
    const slab = {
        capacity,
        liveCount: 0,
        wallRev: -1,
        surfRev: -1,
        memoKey: new Int32Array(capacity),
        camKey: new Int32Array(capacity),
        perspKey: new Int32Array(capacity),
        subdivX: new Int32Array(capacity),
        subdivY: new Int32Array(capacity),
        capPx: new Float32Array(capacity),
        alphaBase: new Float32Array(capacity),
        alphaBandMax: new Float32Array(capacity),
        capHeight: new Float32Array(capacity),
        bandHeight: new Float32Array(capacity),
        wallBaseZ: new Float32Array(capacity),
        edgeLen: new Float32Array(capacity),
        wallCx: new Float32Array(capacity),
        wallCy: new Float32Array(capacity),
        atlasWx1: new Float32Array(capacity),
        atlasWy1: new Float32Array(capacity),
        atlasWx2: new Float32Array(capacity),
        atlasWy2: new Float32Array(capacity),
        atlasRev: new Int32Array(capacity),
        atlasSeed: new Int32Array(capacity),
        atlasWallHeightKey: new Float32Array(capacity),
        atlasProfileHash: new Int32Array(capacity),
        handles: new Array(capacity),
        hashTable: new Int32Array(hashCap),
        hashCap,
        freeSlots: new Int32Array(capacity),
        freeCount: 0,
    };
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
