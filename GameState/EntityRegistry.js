import { pruneKineticConstraintsForBody, readEntityFacing, normalizeKineticBody } from "../Libraries/Physics/physics.js";
import { MAX_ENTITIES } from "../Core/engineLimits.js";
import { aabbHashF32, entityIntersectsAabbEidF32, centerReachAabbF32, pointInPolygon, distanceSqToLineSegment, hashString, mixHash4, padAabbF32 } from "../Libraries/Math/math.js";
import { ENGINE_F32, ENGINE_BOUNDS_BASE, B_QUERY, B_PAD, ensureGrowI32, pickWorldPoly, viewBoundsBuf, entityAlive, entityKind, entityFlags, entityGameId, entityRefs, entityX, entityY, entityR } from "../Core/engineMemory.js";
import { SHAPE_TYPE_CIRCLE, SHAPE_TYPE_POLYGON } from "../Core/engineEnums.js";
import { ENTITY_KIND_WORLD_PROP, ENTITY_KIND_NONE, ENTITY_FLAG_DEAD, ENTITY_FLAG_KINETIC, allocateEntityEid, bindEntitySlot, clearWorldPropSpawnPose, entitySlotRef } from "../Libraries/Entity/entitySlots.js";
const KIND_CODE_WORLD_PROP = ENTITY_KIND_WORLD_PROP;
function worldPropFootprintInto(prop, shape) {
    const facing = readEntityFacing(prop);
    const cos = Math.cos(facing);
    const sin = Math.sin(facing);
    const verts = shape.vertices;
    const count = verts.length;
    const out = pickWorldPoly.ensure(count);
    for (let i = 0; i < count; i += 2) {
        const lx = verts[i];
        const ly = verts[i + 1];
        out[i] = prop.x + lx * cos - ly * sin;
        out[i + 1] = prop.y + lx * sin + ly * cos;
    }
    return out;
}
export function worldPropContainsPoint(prop, worldX, worldY, padding = 0) {
    const compound = prop.collisionParts?.length > 1;
    const partCount = compound ? prop.collisionParts.length : prop.shape ? 1 : 0;
    let sawPolygon = false;
    for (let p = 0; p < partCount; p++) {
        const shape = compound ? prop.collisionParts[p] : prop.shape;
        if (shape.shapeTypeId === SHAPE_TYPE_CIRCLE) {
            const r = shape.radius + padding;
            const centerDistSq = (prop.x - worldX) ** 2 + (prop.y - worldY) ** 2;
            if (centerDistSq <= r * r) return true;
            continue;
        }
        if (shape.shapeTypeId === SHAPE_TYPE_POLYGON) {
            sawPolygon = true;
            const worldPoly = worldPropFootprintInto(prop, shape);
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
    const r = prop.radius + padding;
    const centerDistSq = (prop.x - worldX) ** 2 + (prop.y - worldY) ** 2;
    return centerDistSq <= r * r;
}
const WORLD_PROP_KIND_HASH = hashString("worldProp");
function filterQueryHash(filterId) {
    return mixHash4(WORLD_PROP_KIND_HASH, filterId ? hashString(filterId) : 0, 0, 0);
}
function queryViewCacheMatchesF32(entry, spatialGen, membershipGen, buf, o, boundsHash, filterHash) {
    if (!entry) return false;
    if (entry.spatialGen !== spatialGen || entry.membershipGen !== membershipGen) return false;
    if (entry.filterHash !== filterHash) return false;
    if (entry.boundsHash !== boundsHash) return false;
    return entry.minX === buf[o] && entry.minY === buf[o + 1] && entry.maxX === buf[o + 2] && entry.maxY === buf[o + 3];
}
function kindStringToCode(kind) {
    if (kind === "worldProp") return KIND_CODE_WORLD_PROP;
    return ENTITY_KIND_NONE;
}
/**
 * Dense typed entity arena. Slot eid === physId. WorldProp bags live in entityRefs[eid].
 * View queries return count; ids via borrowedQueryIds(filterId).
 */
export class EntityArena {
    constructor() {
        this.membershipGen = 0;
        this._queryCache = new Map();
        this._cacheEntryByFilterId = Object.create(null);
        this._candidateEids = new Int32Array(256);
        this._candidateCount = 0;
        this._candidateSeenGen = new Uint32Array(MAX_ENTITIES);
        this._candidateQueryGen = 0;
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
        ensureGrowI32(this, "_liveEids", n);
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
    _borrowIdBuffer(filterId, minCap) {
        const key = filterId ?? "";
        ensureGrowI32(this._idSlotByFilterId, key, minCap);
        return this._idSlotByFilterId[key];
    }
    borrowedQueryIds(filterId) {
        return this._idSlotByFilterId[filterId ?? ""];
    }
    _storeQueryViewCacheEntry(filterId, ids, count, spatialGen, membershipGen, buf, o, boundsHash, filterHash) {
        const key = filterId ?? "";
        let entry = this._cacheEntryByFilterId[key];
        if (!entry) entry = this._cacheEntryByFilterId[key] = { ids, count: 0, spatialGen: 0, membershipGen: 0, boundsHash: 0, filterHash: 0, minX: 0, minY: 0, maxX: 0, maxY: 0 };
        entry.ids = ids;
        entry.count = count;
        entry.spatialGen = spatialGen;
        entry.membershipGen = membershipGen;
        entry.boundsHash = boundsHash;
        entry.filterHash = filterHash;
        entry.minX = buf[o];
        entry.minY = buf[o + 1];
        entry.maxX = buf[o + 2];
        entry.maxY = buf[o + 3];
        return entry;
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
            bindEntitySlot(eid, kindCode, ref, ref.id | 0, ref.x, ref.y, ref.radius, flags);
            ref._physId = eid;
            clearWorldPropSpawnPose(ref);
            if (flags & ENTITY_FLAG_KINETIC) normalizeKineticBody(ref);
            this._bumpMembership();
            return;
        }
        let eid = ref._physId;
        if (eid === undefined) eid = this.allocateEid();
        let flags = 0;
        if (ref.isDead) flags |= ENTITY_FLAG_DEAD;
        if (ref.strategy?.isKinetic) flags |= ENTITY_FLAG_KINETIC;
        bindEntitySlot(eid, kindCode, ref, ref.id | 0, ref.x, ref.y, ref.radius, flags);
        ref._physId = eid;
        clearWorldPropSpawnPose(ref);
        if (flags & ENTITY_FLAG_KINETIC) normalizeKineticBody(ref);
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
    queryViewTier(spatialFrame, tierO, filterId, match) {
        return this._queryViewCached(spatialFrame, viewBoundsBuf, tierO, filterId, match);
    }
    queryInAabbF32(spatialFrame, buf, o, filterId, match) {
        return this._queryViewCached(spatialFrame, buf, o, filterId, match);
    }
    _queryViewCached(spatialFrame, buf, o, filterId, match) {
        const spatialGen = spatialFrame?.frameId ?? -1;
        const boundsHash = aabbHashF32(buf, o);
        const filterHash = filterQueryHash(filterId);
        const cacheKey = filterId ?? "";
        const cached = this._queryCache.get(cacheKey);
        if (queryViewCacheMatchesF32(cached, spatialGen, this.membershipGen, buf, o, boundsHash, filterHash)) return cached.count;
        let ids;
        let count;
        if (match && filterId) {
            const baseFilterHash = filterQueryHash("");
            const baseCached = this._queryCache.get("");
            if (queryViewCacheMatchesF32(baseCached, spatialGen, this.membershipGen, buf, o, boundsHash, baseFilterHash)) {
                ids = this._borrowIdBuffer(filterId, baseCached.count);
                count = 0;
                for (let i = 0; i < baseCached.count; i++) {
                    const eid = baseCached.ids[i];
                    const ref = entitySlotRef(eid);
                    if (ref && match(ref)) ids[count++] = eid;
                }
                this._queryCache.set(cacheKey, this._storeQueryViewCacheEntry(filterId, ids, count, spatialGen, this.membershipGen, buf, o, boundsHash, filterHash));
                return count;
            }
        }
        count = this._queryIdsInAabbF32(buf, o, match, spatialFrame, filterId);
        ids = this.borrowedQueryIds(filterId);
        this._queryCache.set(cacheKey, this._storeQueryViewCacheEntry(filterId, ids, count, spatialGen, this.membershipGen, buf, o, boundsHash, filterHash));
        return count;
    }
    _ensureCandidateCap(n) {
        ensureGrowI32(this, "_candidateEids", n);
    }
    _pushCandidateEid(eid) {
        this._ensureCandidateCap(this._candidateCount + 1);
        this._candidateEids[this._candidateCount++] = eid;
    }
    _queryIdsInAabbF32(buf, o, match, spatialFrame, filterId) {
        this._candidateCount = 0;
        this._fillViewCandidateEidsF32(buf, o, spatialFrame);
        const ids = this._borrowIdBuffer(filterId, this._candidateCount);
        let count = 0;
        for (let i = 0; i < this._candidateCount; i++) {
            const eid = this._candidateEids[i];
            if (!entityAlive[eid]) continue;
            if ((entityFlags[eid] & ENTITY_FLAG_DEAD) !== 0) continue;
            if (!entityIntersectsAabbEidF32(eid, buf, o)) continue;
            if (match) {
                const ref = entitySlotRef(eid);
                if (!ref || !match(ref)) continue;
            }
            ids[count++] = eid;
        }
        return count;
    }
    _fillViewCandidateEidsF32(buf, o, spatialFrame) {
        if (spatialFrame && spatialFrame.populatedMembershipGen === this.membershipGen) {
            this._fillSpatialCandidateEidsF32(buf, o, spatialFrame);
            return;
        }
        this._fillAllLiveWorldPropEids();
    }
    _fillAllLiveWorldPropEids() {
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
        const padO = ENGINE_BOUNDS_BASE + B_PAD;
        padAabbF32(ENGINE_F32, padO, buf, o, spatialFrame.entityGrid.maxInsertedExtent);
        let n = spatialFrame.collectEntityEidsInBoundsF32(ENGINE_F32, padO, scratch, 0, scratch.length);
        while (n < 0) {
            this._ensureCandidateCap(this._candidateEids.length * 2);
            n = spatialFrame.collectEntityEidsInBoundsF32(ENGINE_F32, padO, this._candidateEids, 0, this._candidateEids.length);
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
    const count = registry.queryInAabbF32(spatialFrame, ENGINE_F32, ENGINE_BOUNDS_BASE + B_QUERY, "", null);
    const ids = registry.borrowedQueryIds("");
    let best = null;
    let bestDistSq = Infinity;
    const pad = padding;
    for (let i = 0; i < count; i++) {
        const eid = ids[i];
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
