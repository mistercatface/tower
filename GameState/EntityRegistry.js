import { pruneKineticConstraintsForBody, getEntityCollisionParts, resolveBodyRadius, entityFacing } from "../Libraries/Physics/physics.js";
import { MAX_ENTITIES } from "../Core/engineLimits.js";
import { aabbHashF32, entityIntersectsAabb, entityIntersectsAabbF32, ENGINE_F32, ENGINE_BOUNDS_BASE, B_QUERY, centerReachAabbF32, pointInPolygon, distanceSqToLineSegment, hashString, mixHash4 } from "../Libraries/Math/math.js";
import { ENTITY_KIND_WORLD_PROP, ENTITY_KIND_NONE, ENTITY_FLAG_DEAD, ENTITY_FLAG_KINETIC, allocateEntityEid, bindEntitySlot, clearWorldPropSpawnPose, entityAlive, entityKind, entityFlags, entityGameId, entityRefs, entityX, entityY, entityR, entitySlotRef } from "../Libraries/Entity/entitySlots.js";
const EMPTY_KINDS = ["worldProp"];
const KIND_CODE_WORLD_PROP = ENTITY_KIND_WORLD_PROP;
let PICK_WORLD_POLY = new Float32Array(64);
function worldPropFootprintInto(out, prop, shape) {
    const facing = entityFacing(prop);
    const cos = Math.cos(facing);
    const sin = Math.sin(facing);
    const verts = shape.vertices;
    const count = verts.length;
    if (out.length < count) out = new Float32Array(count);
    for (let i = 0; i < count; i += 2) {
        const lx = verts[i];
        const ly = verts[i + 1];
        out[i] = prop.x + lx * cos - ly * sin;
        out[i + 1] = prop.y + lx * sin + ly * cos;
    }
    return out;
}
export function worldPropContainsPoint(prop, worldX, worldY, padding = 0) {
    const parts = getEntityCollisionParts(prop);
    let sawPolygon = false;
    for (let p = 0; p < parts.length; p++) {
        const shape = parts[p];
        if (shape.type === "Circle") {
            const r = shape.radius + padding;
            const centerDistSq = (prop.x - worldX) ** 2 + (prop.y - worldY) ** 2;
            if (centerDistSq <= r * r) return true;
            continue;
        }
        if (shape.type === "Polygon") {
            sawPolygon = true;
            PICK_WORLD_POLY = worldPropFootprintInto(PICK_WORLD_POLY, prop, shape);
            const worldPoly = PICK_WORLD_POLY;
            const floatCount = shape.vertices.length;
            if (pointInPolygon(worldX, worldY, worldPoly.subarray(0, floatCount))) return true;
            if (padding <= 0) continue;
            const padSq = padding * padding;
            const count = floatCount / 2;
            for (let i = 0, j = count - 1; i < count; j = i++) {
                const ax = worldPoly[j * 2];
                const ay = worldPoly[j * 2 + 1];
                const bx = worldPoly[i * 2];
                const by = worldPoly[i * 2 + 1];
                if (distanceSqToLineSegment(worldX, worldY, ax, ay, bx, by) <= padSq) return true;
            }
        }
    }
    if (sawPolygon) return false;
    const r = (prop.radius ?? 0) + padding;
    const centerDistSq = (prop.x - worldX) ** 2 + (prop.y - worldY) ** 2;
    return centerDistSq <= r * r;
}
const WORLD_PROP_KIND_HASH = hashString("worldProp");
function kindsQueryHash(kinds) {
    if (kinds.length === 1 && kinds[0] === "worldProp") return WORLD_PROP_KIND_HASH;
    let h = kinds.length;
    for (let i = 0; i < kinds.length; i++) h = mixHash4(h, hashString(kinds[i]), 0, 0);
    return h;
}
function hitTestQueryHash(hitTest) {
    if (hitTest === "circle") return 1;
    if (hitTest === "aabb") return 2;
    if (hitTest === "center") return 3;
    return hashString(hitTest);
}
function filterQueryHash(criteria) {
    const kinds = criteria.kinds ?? EMPTY_KINDS;
    const filterId = criteria.filterId ?? "";
    const hitTest = criteria.hitTest ?? "circle";
    return mixHash4(kindsQueryHash(kinds), filterId ? hashString(filterId) : 0, hitTestQueryHash(hitTest), 0);
}
function queryViewCacheMatchesF32(entry, spatialGen, membershipGen, buf, o, boundsHash, filterHash) {
    if (!entry) return false;
    if (entry.spatialGen !== spatialGen || entry.membershipGen !== membershipGen) return false;
    if (entry.filterHash !== filterHash) return false;
    if (entry.boundsHash !== boundsHash) return false;
    return entry.minX === buf[o] && entry.minY === buf[o + 1] && entry.maxX === buf[o + 2] && entry.maxY === buf[o + 3];
}
function makeQueryViewCacheEntryF32(ids, count, spatialGen, membershipGen, buf, o, boundsHash, filterHash) {
    return { ids, count, spatialGen, membershipGen, boundsHash, filterHash, minX: buf[o], minY: buf[o + 1], maxX: buf[o + 2], maxY: buf[o + 3] };
}
function queryViewCacheKey(spatialGen, membershipGen, boundsHash, filterHash) {
    return mixHash4(spatialGen, membershipGen, boundsHash, filterHash);
}
function kindStringToCode(kind) {
    if (kind === "worldProp") return KIND_CODE_WORLD_PROP;
    return ENTITY_KIND_NONE;
}
function kindsWantWorldProp(kinds) {
    for (let i = 0; i < kinds.length; i++) if (kinds[i] === "worldProp") return true;
    return false;
}
/**
 * Dense typed entity arena. Slot eid === physId. WorldProp bags live in entityRefs[eid].
 * View queries cache id buffers via queryViewIds.
 */
export class EntityArena {
    constructor() {
        this.membershipGen = 0;
        this._queryCache = new Map();
        this._viewQueryDepth = 0;
        this._candidateEids = new Int32Array(256);
        this._candidateCount = 0;
        this._candidateSeenGen = new Uint32Array(MAX_ENTITIES);
        this._candidateQueryGen = 0;
        this._resultSlotByFilterId = Object.create(null);
        this._idSlotByFilterId = Object.create(null);
        this._gameIdToEid = new Map();
        this._liveEids = new Int32Array(256);
        this._liveCount = 0;
        this._batchDepth = 0;
        this._batchDirty = false;
    }
    allocateEid() {
        return allocateEntityEid();
    }
    _ensureLiveCap(n) {
        if (this._liveEids.length >= n) return;
        const next = new Int32Array(Math.max(n, this._liveEids.length * 2));
        next.set(this._liveEids);
        this._liveEids = next;
    }
    _addLiveEid(eid) {
        this._ensureLiveCap(this._liveCount + 1);
        this._liveEids[this._liveCount++] = eid;
    }
    _removeLiveEid(eid) {
        const live = this._liveEids;
        for (let i = 0; i < this._liveCount; i++) {
            if (live[i] !== eid) continue;
            live[i] = live[--this._liveCount];
            return;
        }
    }
    _borrowQueryResultBuffer(filterId) {
        if (this._viewQueryDepth > 1) return [];
        const key = filterId ?? "";
        let buf = this._resultSlotByFilterId[key];
        if (!buf) buf = this._resultSlotByFilterId[key] = [];
        buf.length = 0;
        return buf;
    }
    _borrowIdBuffer(filterId, minCap) {
        const key = filterId ?? "";
        let buf = this._idSlotByFilterId[key];
        if (!buf || buf.length < minCap) {
            buf = new Int32Array(Math.max(minCap, buf ? buf.length * 2 : 256));
            this._idSlotByFilterId[key] = buf;
        }
        return buf;
    }
    _materializeIds(ids, count, filterId) {
        const out = this._borrowQueryResultBuffer(filterId);
        for (let i = 0; i < count; i++) {
            const ref = entitySlotRef(ids[i]);
            if (ref) out.push(ref);
        }
        return out;
    }
    register(kind, ref) {
        if (!ref || ref.id == null) return;
        const kindCode = kindStringToCode(kind);
        if (kindCode === ENTITY_KIND_NONE) return;
        if (this._gameIdToEid.has(ref.id)) {
            const eid = this._gameIdToEid.get(ref.id);
            let flags = 0;
            if (ref.isDead) flags |= ENTITY_FLAG_DEAD;
            if (ref.strategy?.isKinetic) flags |= ENTITY_FLAG_KINETIC;
            bindEntitySlot(eid, kindCode, ref, ref.id | 0, ref.x, ref.y, resolveBodyRadius(ref), flags);
            ref._physId = eid;
            clearWorldPropSpawnPose(ref);
            this._bumpMembership();
            return;
        }
        let eid = ref._physId;
        if (eid === undefined) eid = this.allocateEid();
        let flags = 0;
        if (ref.isDead) flags |= ENTITY_FLAG_DEAD;
        if (ref.strategy?.isKinetic) flags |= ENTITY_FLAG_KINETIC;
        bindEntitySlot(eid, kindCode, ref, ref.id | 0, ref.x, ref.y, resolveBodyRadius(ref), flags);
        ref._physId = eid;
        clearWorldPropSpawnPose(ref);
        this._gameIdToEid.set(ref.id, eid);
        this._addLiveEid(eid);
        this._bumpMembership();
    }
    unregister(refOrId) {
        let id;
        if (typeof refOrId === "object" && refOrId != null) id = refOrId.id;
        else id = refOrId;
        if (id == null) return;
        const eid = this._gameIdToEid.get(id);
        if (eid === undefined) return;
        const ref = entityRefs[eid];
        if (typeof refOrId === "object" && refOrId != null && ref !== refOrId) return;
        this._gameIdToEid.delete(id);
        this._removeLiveEid(eid);
        entityKind[eid] = ENTITY_KIND_NONE;
        entityGameId[eid] = -1;
        this._bumpMembership();
    }
    clear(kind) {
        if (!kind) {
            if (this._liveCount === 0 && this._gameIdToEid.size === 0) return;
            for (let i = 0; i < this._liveCount; i++) {
                const eid = this._liveEids[i];
                entityKind[eid] = ENTITY_KIND_NONE;
                entityGameId[eid] = -1;
            }
            this._liveCount = 0;
            this._gameIdToEid.clear();
            this._bumpMembership();
            return;
        }
        const kindCode = kindStringToCode(kind);
        let removed = false;
        let i = 0;
        while (i < this._liveCount) {
            const eid = this._liveEids[i];
            if (entityKind[eid] !== kindCode) {
                i++;
                continue;
            }
            const gameId = entityGameId[eid];
            if (gameId >= 0) this._gameIdToEid.delete(gameId);
            this._liveEids[i] = this._liveEids[--this._liveCount];
            entityKind[eid] = ENTITY_KIND_NONE;
            entityGameId[eid] = -1;
            removed = true;
        }
        if (removed) this._bumpMembership();
    }
    get(id) {
        const eid = this._gameIdToEid.get(id);
        if (eid === undefined) return null;
        return entitySlotRef(eid);
    }
    getLive(id) {
        const eid = this._gameIdToEid.get(id);
        if (eid === undefined) return null;
        const ref = entitySlotRef(eid);
        return ref && !ref.isDead ? ref : null;
    }
    getRef(eid) {
        return entitySlotRef(eid);
    }
    forEachOfKind(kind, fn) {
        const kindCode = kindStringToCode(kind);
        for (let i = 0; i < this._liveCount; i++) {
            const eid = this._liveEids[i];
            if (entityKind[eid] !== kindCode) continue;
            const ref = entityRefs[eid];
            if (ref) fn(ref);
        }
    }
    queryInAabbStrict(bounds, options = {}) {
        return this._queryInAabb(bounds, options.kinds ?? EMPTY_KINDS, options.match, options.hitTest ?? "center", undefined);
    }
    queryInAabbStrictF32(buf, o, options = {}) {
        const packed = this._queryIdsInAabbF32(buf, o, options.kinds ?? EMPTY_KINDS, options.match, options.hitTest ?? "center", undefined, undefined);
        return this._materializeIds(packed.ids, packed.count, undefined);
    }
    queryViewIds(criteria, spatialFrame) {
        const kinds = criteria.kinds ?? EMPTY_KINDS;
        const hitTest = criteria.hitTest ?? "circle";
        const spatialGen = spatialFrame?.frameId ?? -1;
        const buf = criteria.boundsBuf;
        const o = criteria.boundsO;
        const boundsHash = aabbHashF32(buf, o);
        const filterHash = filterQueryHash(criteria);
        const cacheKey = queryViewCacheKey(spatialGen, this.membershipGen, boundsHash, filterHash);
        const cached = this._queryCache.get(cacheKey);
        if (queryViewCacheMatchesF32(cached, spatialGen, this.membershipGen, buf, o, boundsHash, filterHash)) return { ids: cached.ids, count: cached.count };
        let ids;
        let count;
        if (criteria.match && criteria.filterId) {
            const baseFilterHash = filterQueryHash({ kinds, hitTest });
            const baseCacheKey = queryViewCacheKey(spatialGen, this.membershipGen, boundsHash, baseFilterHash);
            const baseCached = this._queryCache.get(baseCacheKey);
            if (queryViewCacheMatchesF32(baseCached, spatialGen, this.membershipGen, buf, o, boundsHash, baseFilterHash)) {
                ids = this._borrowIdBuffer(criteria.filterId, baseCached.count);
                count = 0;
                for (let i = 0; i < baseCached.count; i++) {
                    const eid = baseCached.ids[i];
                    const ref = entitySlotRef(eid);
                    if (ref && criteria.match(ref)) ids[count++] = eid;
                }
                this._queryCache.set(cacheKey, makeQueryViewCacheEntryF32(ids, count, spatialGen, this.membershipGen, buf, o, boundsHash, filterHash));
                return { ids, count };
            }
        }
        const packed = this._queryIdsInAabbF32(buf, o, kinds, criteria.match, hitTest, spatialFrame, criteria.filterId);
        ids = packed.ids;
        count = packed.count;
        this._queryCache.set(cacheKey, makeQueryViewCacheEntryF32(ids, count, spatialGen, this.membershipGen, buf, o, boundsHash, filterHash));
        return { ids, count };
    }
    _queryInAabb(bounds, kinds, match, hitTest, filterId) {
        const packed = this._queryIdsInAabb(bounds, kinds, match, hitTest, filterId);
        return this._materializeIds(packed.ids, packed.count, filterId);
    }
    _ensureCandidateCap(n) {
        if (this._candidateEids.length >= n) return;
        const next = new Int32Array(Math.max(n, this._candidateEids.length * 2));
        next.set(this._candidateEids);
        this._candidateEids = next;
    }
    _pushCandidateEid(eid) {
        this._ensureCandidateCap(this._candidateCount + 1);
        this._candidateEids[this._candidateCount++] = eid;
    }
    _queryIdsInAabb(bounds, kinds, match, hitTest, filterId) {
        this._viewQueryDepth++;
        this._candidateCount = 0;
        try {
            this._fillAllLiveWorldPropEids(kinds);
            const ids = this._borrowIdBuffer(filterId, this._candidateCount);
            let count = 0;
            for (let i = 0; i < this._candidateCount; i++) {
                const eid = this._candidateEids[i];
                const ref = entitySlotRef(eid);
                if (!ref || ref.isDead) continue;
                if (!entityIntersectsAabb(ref, bounds, hitTest)) continue;
                if (match && !match(ref)) continue;
                ids[count++] = eid;
            }
            return { ids, count };
        } finally {
            this._viewQueryDepth--;
        }
    }
    _queryIdsInAabbF32(buf, o, kinds, match, hitTest, spatialFrame, filterId) {
        this._viewQueryDepth++;
        this._candidateCount = 0;
        try {
            this._fillViewCandidateEidsF32(buf, o, kinds, spatialFrame);
            const ids = this._borrowIdBuffer(filterId, this._candidateCount);
            let count = 0;
            for (let i = 0; i < this._candidateCount; i++) {
                const eid = this._candidateEids[i];
                const ref = entitySlotRef(eid);
                if (!ref || ref.isDead) continue;
                if ((entityFlags[eid] & ENTITY_FLAG_DEAD) !== 0) continue;
                if (!entityIntersectsAabbF32(ref, buf, o, hitTest)) continue;
                if (match && !match(ref)) continue;
                ids[count++] = eid;
            }
            return { ids, count };
        } finally {
            this._viewQueryDepth--;
        }
    }
    _fillViewCandidateEidsF32(buf, o, kinds, spatialFrame) {
        if (!kindsWantWorldProp(kinds)) return;
        if (spatialFrame && spatialFrame.populatedMembershipGen === this.membershipGen) {
            this._fillSpatialCandidateEidsF32(buf, o, spatialFrame);
            return;
        }
        this._fillAllLiveWorldPropEids(kinds);
    }
    _fillAllLiveWorldPropEids(kinds) {
        if (kinds && !kindsWantWorldProp(kinds)) return;
        for (let i = 0; i < this._liveCount; i++) {
            const eid = this._liveEids[i];
            if (entityKind[eid] !== KIND_CODE_WORLD_PROP) continue;
            this._pushCandidateEid(eid);
        }
    }
    _fillSpatialCandidateEidsF32(buf, o, spatialFrame) {
        const queryGen = ++this._candidateQueryGen;
        const scratch = this._candidateEids;
        this._ensureCandidateCap(256);
        let n = spatialFrame.collectEntityEidsInBoundsF32(buf, o, scratch, scratch.length);
        while (n < 0) {
            this._ensureCandidateCap(this._candidateEids.length * 2);
            n = spatialFrame.collectEntityEidsInBoundsF32(buf, o, this._candidateEids, this._candidateEids.length);
        }
        const eidBuf = this._candidateEids;
        this._candidateCount = 0;
        for (let i = 0; i < n; i++) {
            const eid = eidBuf[i];
            if (!entityAlive[eid] || entityKind[eid] !== KIND_CODE_WORLD_PROP) continue;
            if (this._candidateSeenGen[eid] === queryGen) continue;
            this._candidateSeenGen[eid] = queryGen;
            this._pushCandidateEid(eid);
        }
    }
    beginMembershipBatch() {
        this._batchDepth++;
    }
    endMembershipBatch() {
        this._batchDepth = Math.max(0, this._batchDepth - 1);
        if (this._batchDepth === 0 && this._batchDirty) {
            this._batchDirty = false;
            this._bumpMembership();
        }
    }
    _bumpMembership() {
        if (this._batchDepth > 0) {
            this._batchDirty = true;
            return;
        }
        this.membershipGen = (this.membershipGen + 1) | 0;
        this._queryCache.clear();
    }
}
export { EntityArena as EntityRegistry };
export function addWorldPropToState(world, prop) {
    world.worldProps.push(prop);
    world.entityRegistry.register("worldProp", prop);
}
export function addWorldPropsToState(world, props) {
    world.entityRegistry.beginMembershipBatch();
    try {
        for (let i = 0; i < props.length; i++) {
            const prop = props[i];
            world.worldProps.push(prop);
            world.entityRegistry.register("worldProp", prop);
        }
    } finally {
        world.entityRegistry.endMembershipBatch();
    }
}
export function removeWorldPropFromState(world, prop, spatialFrame, entityMeta = null) {
    if (!spatialFrame) throw new Error("spatialFrame must be provided to removeWorldPropFromState");
    const index = world.worldProps.indexOf(prop);
    if (index >= 0) world.worldProps.splice(index, 1);
    world.entityRegistry.unregister(prop);
    entityMeta?.delete(prop.id);
    pruneKineticConstraintsForBody(world.kinetic, prop.id);
    spatialFrame.evictKineticProp(prop, world.kinetic);
    prop.isDead = true;
}
export function visitLiveWorldProps(worldProps, visit) {
    for (let i = 0; i < worldProps.length; i++) {
        const prop = worldProps[i];
        if (prop.isDead) continue;
        visit(prop);
    }
}
export function findLiveWorldProp(worldProps, pred) {
    for (let i = 0; i < worldProps.length; i++) {
        const prop = worldProps[i];
        if (prop.isDead) continue;
        if (pred(prop)) return prop;
    }
    return null;
}
export function findWorldPropAtInView(registry, spatialFrame, worldX, worldY, padding = 8) {
    centerReachAabbF32(ENGINE_F32, ENGINE_BOUNDS_BASE + B_QUERY, worldX, worldY, padding + 48);
    const packed = registry.queryViewIds({ boundsBuf: ENGINE_F32, boundsO: ENGINE_BOUNDS_BASE + B_QUERY, kinds: ["worldProp"] }, spatialFrame);
    let best = null;
    let bestDistSq = Infinity;
    const pad = padding;
    for (let i = 0; i < packed.count; i++) {
        const eid = packed.ids[i];
        const dx = entityX[eid] - worldX;
        const dy = entityY[eid] - worldY;
        const distSq = dx * dx + dy * dy;
        const r = entityR[eid] + pad;
        if (distSq > r * r * 4) continue;
        const prop = entitySlotRef(eid);
        if (!prop || prop.isDead) continue;
        if (!worldPropContainsPoint(prop, worldX, worldY, pad)) continue;
        if (distSq < bestDistSq) {
            best = prop;
            bestDistSq = distSq;
        }
    }
    return best;
}
