import { getSandboxEntityMeta } from "./sandboxEntityMeta.js";
import { clearKineticConstraints, pruneKineticConstraintsForBody } from "../Libraries/Motion/kineticConstraints.js";
import { kineticSpatial } from "../Systems/World/KineticSpatialFrame.js";
import { aabbHash, centerReachAabbInto, createAabb, entityIntersectsAabb } from "../Libraries/Math/Aabb2D.js";
import { pointInPolygon, transformPoint2DInto } from "../Libraries/Math/Poly2D.js";
import { distanceSqToLineSegment } from "../Libraries/Math/Segment2D.js";
import { hashString, mixHash4 } from "../Libraries/Math/hash.js";
import { getEntityCollisionParts } from "../Libraries/Spatial/collision/SatCollision.js";
/** @typedef {import("../Libraries/Math/Aabb2D.js").Aabb2D} Aabb2D */
/** @typedef {import("../Libraries/Math/Aabb2D.js").AabbEntityHitTest} AabbEntityHitTest */
/** @typedef {{ kind: string, ref: object }} EntityRegistryEntry */
/**
 * @typedef {Object} QueryViewCriteria
 * @property {Aabb2D} bounds
 * @property {string[]} [kinds]
 * @property {string} [filterId] — cache key segment for optional `match`
 * @property {(ref: object) => boolean} [match]
 * @property {AabbEntityHitTest} [hitTest]
 */
/**
 * @typedef {Object} QueryInAabbStrictOptions
 * @property {string[]} [kinds]
 * @property {(ref: object) => boolean} [match]
 * @property {AabbEntityHitTest} [hitTest]
 */
const EMPTY_KINDS = ["worldProp"];
const PICK_SEARCH_BOUNDS = createAabb();
const PICK_WORLD_POLY = [];
function worldPropFootprintInto(out, prop, shape) {
    const facing = prop.facing ?? prop.angle ?? 0;
    const cos = Math.cos(facing);
    const sin = Math.sin(facing);
    const verts = shape.vertices;
    out.length = verts.length;
    for (let i = 0; i < verts.length; i++) {
        if (!out[i]) out[i] = { x: 0, y: 0 };
        transformPoint2DInto(out[i], prop.x, prop.y, verts[i].x, verts[i].y, cos, sin);
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
            const worldPoly = worldPropFootprintInto(PICK_WORLD_POLY, prop, shape);
            if (pointInPolygon(worldX, worldY, worldPoly)) return true;
            if (padding <= 0) continue;
            const padSq = padding * padding;
            for (let i = 0, j = worldPoly.length - 1; i < worldPoly.length; j = i++) {
                const a = worldPoly[j];
                const b = worldPoly[i];
                if (distanceSqToLineSegment(worldX, worldY, a.x, a.y, b.x, b.y) <= padSq) return true;
            }
        }
    }
    if (sawPolygon) return false;
    const r = (prop.radius ?? 0) + padding;
    const centerDistSq = (prop.x - worldX) ** 2 + (prop.y - worldY) ** 2;
    return centerDistSq <= r * r;
}
/** @param {QueryViewCriteria} criteria */
function filterKey(criteria) {
    const kinds = criteria.kinds ?? EMPTY_KINDS;
    const filterId = criteria.filterId ?? "";
    const hitTest = criteria.hitTest ?? "circle";
    return `${kinds.join(",")}|${filterId}|${hitTest}`;
}
/**
 * @typedef {Object} QueryViewCacheEntry
 * @property {object[]} result
 * @property {number} spatialGen
 * @property {number} membershipGen
 * @property {number} boundsHash
 * @property {number} filterHash
 * @property {string} filterKey
 * @property {number} minX
 * @property {number} minY
 * @property {number} maxX
 * @property {number} maxY
 */
/** @param {QueryViewCacheEntry | undefined} entry @param {number} spatialGen @param {number} membershipGen @param {Aabb2D} bounds @param {number} boundsHash @param {number} filterHash @param {string} filterKey */
function queryViewCacheMatches(entry, spatialGen, membershipGen, bounds, boundsHash, filterHash, filterKey) {
    if (!entry) return false;
    if (entry.spatialGen !== spatialGen || entry.membershipGen !== membershipGen) return false;
    if (entry.filterHash !== filterHash || entry.filterKey !== filterKey) return false;
    if (entry.boundsHash !== boundsHash) return false;
    return entry.minX === bounds.minX && entry.minY === bounds.minY && entry.maxX === bounds.maxX && entry.maxY === bounds.maxY;
}
/** @param {object[]} result @param {number} spatialGen @param {number} membershipGen @param {Aabb2D} bounds @param {number} boundsHash @param {number} filterHash @param {string} filterKey @returns {QueryViewCacheEntry} */
function makeQueryViewCacheEntry(result, spatialGen, membershipGen, bounds, boundsHash, filterHash, filterKey) {
    return { result, spatialGen, membershipGen, boundsHash, filterHash, filterKey, minX: bounds.minX, minY: bounds.minY, maxX: bounds.maxX, maxY: bounds.maxY };
}
/** @param {number} spatialGen @param {number} membershipGen @param {number} boundsHash @param {number} filterHash */
function queryViewCacheKey(spatialGen, membershipGen, boundsHash, filterHash) {
    return mixHash4(spatialGen, membershipGen, boundsHash, filterHash);
}
/**
 * Exact AABB membership query — full registry scan, no spatial broadphase.
 * Use for editor box-select and other pick semantics that must match a drawn rectangle.
 *
 * @param {EntityRegistry} registry
 * @param {Aabb2D} bounds
 * @param {QueryInAabbStrictOptions} [options]
 * @returns {object[]}
 */
export function queryEntitiesInAabbStrict(registry, bounds, options = {}) {
    return registry.queryInAabbStrict(bounds, options);
}
/**
 * Instance masterlist over live entity refs. Arrays remain source of truth;
 * registry indexes id → { kind, ref } and serves cached bounds queries.
 */
export class EntityRegistry {
    constructor() {
        /** @type {Map<string | number, EntityRegistryEntry>} */
        this._entries = new Map();
        this.membershipGen = 0;
        /** @type {Map<number, QueryViewCacheEntry>} */
        this._queryCache = new Map();
        this._viewQueryDepth = 0;
        /** Reused candidate buffer for view queries — do not retain references across calls. */
        this._candidateScratch = [];
        /** Reused id set for spatial candidate dedupe — cleared each spatial fill. */
        this._candidateSeenIds = new Set();
        /** Reused kind filter — cleared each top-level view query. */
        this._kindSetScratch = new Set();
        /** Reused result buffers per filterId — do not retain references across calls. */
        this._resultSlotByFilterId = Object.create(null);
    }
    /**
     * Registry-owned query result buffer. Cleared on each borrow.
     * Re-entrant queries (depth > 1) fall back to a fresh array.
     * @param {string | undefined} filterId
     * @returns {object[]}
     */
    _borrowQueryResultBuffer(filterId) {
        if (this._viewQueryDepth > 1) return [];
        const key = filterId ?? "";
        let buf = this._resultSlotByFilterId[key];
        if (!buf) buf = this._resultSlotByFilterId[key] = [];
        buf.length = 0;
        return buf;
    }
    /** @param {string} kind @param {object} ref */
    register(kind, ref) {
        if (!ref || ref.id == null) return;
        this._entries.set(ref.id, { kind, ref });
        this._bumpMembership();
    }
    /** @param {object | string | number} refOrId */
    unregister(refOrId) {
        let id;
        if (typeof refOrId === "object" && refOrId != null) id = refOrId.id;
        else id = refOrId;
        if (id == null) return;
        const entry = this._entries.get(id);
        if (!entry) return;
        if (typeof refOrId === "object" && refOrId != null && entry.ref !== refOrId) return;
        this._entries.delete(id);
        this._bumpMembership();
    }
    /** @param {string} [kind] */
    clear(kind) {
        if (!kind) {
            if (this._entries.size === 0) return;
            this._entries.clear();
            this._bumpMembership();
            return;
        }
        let removed = false;
        for (const [id, entry] of this._entries) {
            if (entry.kind !== kind) continue;
            this._entries.delete(id);
            removed = true;
        }
        if (removed) this._bumpMembership();
    }
    /** @param {string | number} id @returns {object | null} */
    get(id) {
        return this._entries.get(id)?.ref ?? null;
    }
    /** @param {string | number} id @returns {object | null} */
    getLive(id) {
        const entry = this._entries.get(id);
        const ref = entry?.ref;
        return ref && !ref.isDead ? ref : null;
    }
    /** @param {string} kind @param {(ref: object) => void} fn */
    forEachOfKind(kind, fn) {
        for (const entry of this._entries.values()) if (entry.kind === kind) fn(entry.ref);
    }
    /**
     * @param {Aabb2D} bounds
     * @param {QueryInAabbStrictOptions} [options]
     * @returns {object[]}
     */
    queryInAabbStrict(bounds, options = {}) {
        return this._queryInAabb(bounds, options.kinds ?? EMPTY_KINDS, options.match, options.hitTest ?? "center", null, undefined);
    }
    /**
     * View/cull query — spatial broadphase when fresh, then entity-vs-AABB filter on candidates.
     * Returned array is registry-owned; do not retain references across frames or query calls.
     *
     * @param {QueryViewCriteria} criteria
     * @param {import("../Libraries/Spatial/world/SpatialFrameCore.js").SpatialFrameCore | null | undefined} spatialFrame
     * @returns {object[]}
     */
    queryView(criteria, spatialFrame) {
        const kinds = criteria.kinds ?? EMPTY_KINDS;
        const hitTest = criteria.hitTest ?? "circle";
        const spatialGen = spatialFrame?.frameId ?? -1;
        const bounds = criteria.bounds;
        const boundsHash = aabbHash(bounds);
        const filterKeyStr = filterKey(criteria);
        const filterHash = hashString(filterKeyStr);
        const cacheKey = queryViewCacheKey(spatialGen, this.membershipGen, boundsHash, filterHash);
        const cached = this._queryCache.get(cacheKey);
        if (queryViewCacheMatches(cached, spatialGen, this.membershipGen, bounds, boundsHash, filterHash, filterKeyStr)) return cached.result;
        let result;
        if (criteria.match && criteria.filterId) {
            const baseFilterKeyStr = filterKey({ kinds, hitTest });
            const baseFilterHash = hashString(baseFilterKeyStr);
            const baseCacheKey = queryViewCacheKey(spatialGen, this.membershipGen, boundsHash, baseFilterHash);
            const baseCached = this._queryCache.get(baseCacheKey);
            if (queryViewCacheMatches(baseCached, spatialGen, this.membershipGen, bounds, boundsHash, baseFilterHash, baseFilterKeyStr)) {
                result = this._borrowQueryResultBuffer(criteria.filterId);
                for (let i = 0; i < baseCached.result.length; i++) {
                    const ref = baseCached.result[i];
                    if (criteria.match(ref)) result.push(ref);
                }
                this._queryCache.set(cacheKey, makeQueryViewCacheEntry(result, spatialGen, this.membershipGen, bounds, boundsHash, filterHash, filterKeyStr));
                return result;
            }
        }
        result = this._queryInAabb(bounds, kinds, criteria.match, hitTest, spatialFrame, criteria.filterId);
        this._queryCache.set(cacheKey, makeQueryViewCacheEntry(result, spatialGen, this.membershipGen, bounds, boundsHash, filterHash, filterKeyStr));
        return result;
    }
    /**
     * @param {Aabb2D} bounds
     * @param {string[]} kinds
     * @param {((ref: object) => boolean) | undefined} match
     * @param {AabbEntityHitTest} hitTest
     * @param {import("../Libraries/Spatial/world/SpatialFrameCore.js").SpatialFrameCore | null | undefined} spatialFrame
     * @param {string | undefined} filterId
     * @returns {object[]}
     */
    _queryInAabb(bounds, kinds, match, hitTest, spatialFrame, filterId) {
        this._viewQueryDepth++;
        const kindSet = this._kindSetForQuery(kinds);
        const candidates = this._viewQueryDepth === 1 ? this._candidateScratch : [];
        candidates.length = 0;
        try {
            this._fillViewCandidates(candidates, bounds, kindSet, spatialFrame);
            const result = this._borrowQueryResultBuffer(filterId);
            for (let i = 0; i < candidates.length; i++) {
                const ref = candidates[i];
                if (ref.isDead) continue;
                if (!entityIntersectsAabb(ref, bounds, hitTest)) continue;
                if (match && !match(ref)) continue;
                result.push(ref);
            }
            return result;
        } finally {
            this._viewQueryDepth--;
        }
    }
    /** @param {string[]} kinds @returns {Set<string>} */
    _kindSetForQuery(kinds) {
        if (this._viewQueryDepth > 1) return new Set(kinds);
        const set = this._kindSetScratch;
        set.clear();
        for (let i = 0; i < kinds.length; i++) set.add(kinds[i]);
        return set;
    }
    /**
     * @param {object[]} out
     * @param {Aabb2D} bounds
     * @param {Set<string>} kindSet
     * @param {import("../Libraries/Spatial/world/SpatialFrameCore.js").SpatialFrameCore | null | undefined} spatialFrame
     */
    _fillViewCandidates(out, bounds, kindSet, spatialFrame) {
        if (spatialFrame && spatialFrame.populatedMembershipGen === this.membershipGen) {
            this._fillSpatialViewCandidates(out, bounds, kindSet, spatialFrame);
            return;
        }
        this._fillAllEntriesOfKinds(out, kindSet);
    }
    /** @param {object[]} out @param {Set<string>} kindSet */
    _fillAllEntriesOfKinds(out, kindSet) {
        for (const entry of this._entries.values()) if (kindSet.has(entry.kind)) out.push(entry.ref);
    }
    /**
     * @param {object[]} out
     * @param {Aabb2D} bounds
     * @param {Set<string>} kindSet
     * @param {import("../Libraries/Spatial/world/SpatialFrameCore.js").SpatialFrameCore} spatialFrame
     */
    _fillSpatialViewCandidates(out, bounds, kindSet, spatialFrame) {
        const seen = this._viewQueryDepth === 1 ? this._candidateSeenIds : new Set();
        seen.clear();
        const entities = spatialFrame.collectEntitiesInBounds(bounds);
        for (let i = 0; i < entities.length; i++) {
            const entry = this._entries.get(entities[i].id);
            if (!entry || !kindSet.has(entry.kind)) continue;
            out.push(entry.ref);
            seen.add(entry.ref.id);
        }
        for (const entry of this._entries.values()) {
            if (!kindSet.has(entry.kind) || seen.has(entry.ref.id)) continue;
            const tileIdx = entry.ref._gridTileIdx;
            if (tileIdx != null && tileIdx !== -1) continue;
            out.push(entry.ref);
        }
    }
    _bumpMembership() {
        this.membershipGen = (this.membershipGen + 1) | 0;
        this._queryCache.clear();
    }
}
/** @param {object} world @param {object} prop */
export function addWorldPropToState(world, prop) {
    world.worldProps.push(prop);
    world.entityRegistry.register("worldProp", prop);
}
/** @param {object} world @param {object} prop @param {object} [spatialFrame] @param {object | null} [entityMeta] */
export function removeWorldPropFromState(world, prop, spatialFrame = kineticSpatial, entityMeta = null) {
    const index = world.worldProps.indexOf(prop);
    if (index >= 0) world.worldProps.splice(index, 1);
    world.entityRegistry.unregister(prop);
    entityMeta?.delete(prop.id);
    pruneKineticConstraintsForBody(world.kinetic, prop.id);
    spatialFrame.evictKineticProp(prop, world.kinetic);
}
/** @param {object} state */
export function clearWorldPropsInState(state) {
    const meta = getSandboxEntityMeta(state);
    for (let i = 0; i < state.worldProps.length; i++) meta?.delete(state.worldProps[i].id);
    state.worldProps = [];
    state.entityRegistry.clear("worldProp");
    clearKineticConstraints(state.kinetic);
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
/** @param {object[]} worldProps @param {number} worldX @param {number} worldY @param {number} padding */
function nearestWorldPropInList(worldProps, worldX, worldY, padding) {
    let best = null;
    let bestDistSq = Infinity;
    for (let i = 0; i < worldProps.length; i++) {
        const prop = worldProps[i];
        if (prop.isDead) continue;
        if (!worldPropContainsPoint(prop, worldX, worldY, padding)) continue;
        const distSq = (prop.x - worldX) ** 2 + (prop.y - worldY) ** 2;
        if (distSq < bestDistSq) {
            best = prop;
            bestDistSq = distSq;
        }
    }
    return best;
}
/**
 * @param {EntityRegistry} registry
 * @param {import("../Libraries/Spatial/world/SpatialFrameCore.js").SpatialFrameCore} spatialFrame
 * @param {number} worldX
 * @param {number} worldY
 * @param {number} [padding]
 */
export function findWorldPropAtInView(registry, spatialFrame, worldX, worldY, padding = 8) {
    centerReachAabbInto(PICK_SEARCH_BOUNDS, worldX, worldY, padding + 48);
    const candidates = registry.queryView({ bounds: PICK_SEARCH_BOUNDS, kinds: ["worldProp"] }, spatialFrame);
    return nearestWorldPropInList(candidates, worldX, worldY, padding);
}
