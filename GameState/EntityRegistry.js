import { getSandboxEntityMeta } from "../Libraries/Sandbox/sandboxEntityMeta.js";
import { circleIntersectsAabb, pointInAabb } from "../Libraries/Math/Aabb2D.js";
/** @typedef {{ minX: number, minY: number, maxX: number, maxY: number }} BoundsRect */
/** @typedef {{ kind: string, ref: object }} EntityRegistryEntry */
/** @typedef {'center' | 'circle'} AabbEntityHitTest */
/**
 * @typedef {Object} QueryViewCriteria
 * @property {BoundsRect} bounds
 * @property {string[]} [kinds]
 * @property {string} [filterId] — cache key segment for optional `match`
 * @property {(ref: object) => boolean} [match]
 */
/**
 * @typedef {Object} QueryInAabbStrictOptions
 * @property {string[]} [kinds]
 * @property {(ref: object) => boolean} [match]
 * @property {AabbEntityHitTest} [hitTest]
 */
const EMPTY_KINDS = ["worldProp"];
/** @param {object} ref @param {BoundsRect} bounds @param {AabbEntityHitTest} hitTest */
function entityIntersectsAabb(ref, bounds, hitTest) {
    if (hitTest === "center") return pointInAabb(ref.x, ref.y, bounds);
    const radius = ref.getBoundingRadius?.() ?? ref.radius ?? 0;
    return circleIntersectsAabb(ref.x, ref.y, radius, bounds);
}
/** @param {BoundsRect} bounds */
function boundsKey(bounds) {
    return `${bounds.minX}|${bounds.minY}|${bounds.maxX}|${bounds.maxY}`;
}
/** @param {QueryViewCriteria} criteria */
function filterKey(criteria) {
    const kinds = criteria.kinds ?? EMPTY_KINDS;
    const filterId = criteria.filterId ?? "";
    return `${kinds.join(",")}|${filterId}`;
}
/**
 * Exact AABB membership query — full registry scan, no spatial broadphase.
 * Use for editor box-select and other pick semantics that must match a drawn rectangle.
 *
 * @param {EntityRegistry} registry
 * @param {BoundsRect} bounds
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
        /** @type {Map<string, { result: object[], spatialGen: number, membershipGen: number }>} */
        this._queryCache = new Map();
        this._viewQueryDepth = 0;
        /** Reused candidate buffer for view queries — do not retain references across calls. */
        this._candidateScratch = [];
        /** Reused id set for spatial candidate dedupe — cleared each spatial fill. */
        this._candidateSeenIds = new Set();
        /** Reused kind filter — cleared each top-level view query. */
        this._kindSetScratch = new Set();
    }
    /** @param {string} kind @param {object} ref */
    register(kind, ref) {
        if (!ref || ref.id == null) return;
        this._entries.set(ref.id, { kind, ref });
        this._bumpMembership();
    }
    /** @param {object | string | number} refOrId */
    unregister(refOrId) {
        const id = typeof refOrId === "object" && refOrId != null ? refOrId.id : refOrId;
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
        const ref = this.get(id);
        return ref && !ref.isDead ? ref : null;
    }
    /** @param {string} kind @param {(ref: object) => void} fn */
    forEachOfKind(kind, fn) {
        for (const entry of this._entries.values()) if (entry.kind === kind) fn(entry.ref);
    }
    /**
     * @param {BoundsRect} bounds
     * @param {QueryInAabbStrictOptions} [options]
     * @returns {object[]}
     */
    queryInAabbStrict(bounds, options = {}) {
        return this._queryInAabb(bounds, options.kinds ?? EMPTY_KINDS, options.match, options.hitTest ?? "center", null);
    }
    /**
     * View/cull query — spatial broadphase when fresh, then circle-vs-AABB filter on candidates.
     *
     * @param {QueryViewCriteria} criteria
     * @param {import("../Libraries/Spatial/world/SpatialFrameCore.js").SpatialFrameCore | null | undefined} spatialFrame
     * @returns {object[]}
     */
    queryView(criteria, spatialFrame) {
        const kinds = criteria.kinds ?? EMPTY_KINDS;
        const spatialGen = spatialFrame?.frameId ?? -1;
        const bKey = boundsKey(criteria.bounds);
        const fKey = filterKey(criteria);
        const cacheKey = `${spatialGen}|${this.membershipGen}|${bKey}|${fKey}`;
        const cached = this._queryCache.get(cacheKey);
        if (cached && cached.spatialGen === spatialGen && cached.membershipGen === this.membershipGen) return cached.result;
        let result;
        if (criteria.match && criteria.filterId) {
            const baseKey = `${spatialGen}|${this.membershipGen}|${bKey}|${filterKey({ bounds: criteria.bounds, kinds })}`;
            const baseCached = this._queryCache.get(baseKey);
            if (baseCached && baseCached.spatialGen === spatialGen && baseCached.membershipGen === this.membershipGen) {
                result = [];
                for (let i = 0; i < baseCached.result.length; i++) {
                    const ref = baseCached.result[i];
                    if (criteria.match(ref)) result.push(ref);
                }
                this._queryCache.set(cacheKey, { result, spatialGen, membershipGen: this.membershipGen });
                return result;
            }
        }
        result = this._queryInAabb(criteria.bounds, kinds, criteria.match, "circle", spatialFrame);
        this._queryCache.set(cacheKey, { result, spatialGen, membershipGen: this.membershipGen });
        return result;
    }
    /**
     * @param {BoundsRect} bounds
     * @param {string[]} kinds
     * @param {((ref: object) => boolean) | undefined} match
     * @param {AabbEntityHitTest} hitTest
     * @param {import("../Libraries/Spatial/world/SpatialFrameCore.js").SpatialFrameCore | null | undefined} spatialFrame
     * @returns {object[]}
     */
    _queryInAabb(bounds, kinds, match, hitTest, spatialFrame) {
        this._viewQueryDepth++;
        const kindSet = this._kindSetForQuery(kinds);
        const candidates = this._viewQueryDepth === 1 ? this._candidateScratch : [];
        candidates.length = 0;
        try {
            this._fillViewCandidates(candidates, bounds, kindSet, spatialFrame);
            /** @type {object[]} */
            const result = [];
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
     * @param {BoundsRect} bounds
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
     * @param {BoundsRect} bounds
     * @param {Set<string>} kindSet
     * @param {import("../Libraries/Spatial/world/SpatialFrameCore.js").SpatialFrameCore} spatialFrame
     */
    _fillSpatialViewCandidates(out, bounds, kindSet, spatialFrame) {
        const seen = this._viewQueryDepth === 1 ? this._candidateSeenIds : new Set();
        seen.clear();
        const entities = spatialFrame.collectEntitiesInBounds(bounds.minX, bounds.minY, bounds.maxX, bounds.maxY);
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
/** @param {object} state @param {object} prop */
export function addWorldPropToState(state, prop) {
    state.worldProps.push(prop);
    state.entityRegistry.register("worldProp", prop);
}
/** @param {object} state @param {object} prop */
export function removeWorldPropFromState(state, prop) {
    const index = state.worldProps.indexOf(prop);
    if (index >= 0) state.worldProps.splice(index, 1);
    state.entityRegistry.unregister(prop);
    getSandboxEntityMeta(state)?.delete(prop.id);
}
/** @param {object} state @param {object} pad */
export function addPadToState(state, pad) {
    state.sandbox.pads.push(pad);
    state.entityRegistry.register("pad", pad);
}
/** @param {object} state @param {object} pad */
export function removePadFromState(state, pad) {
    const index = state.sandbox.pads.indexOf(pad);
    if (index >= 0) state.sandbox.pads.splice(index, 1);
    state.entityRegistry.unregister(pad);
    getSandboxEntityMeta(state)?.delete(pad.id);
}
/** @param {object} state */
export function clearWorldPropsInState(state) {
    const meta = getSandboxEntityMeta(state);
    for (let i = 0; i < state.worldProps.length; i++) meta?.delete(state.worldProps[i].id);
    state.worldProps = [];
    state.entityRegistry.clear("worldProp");
}
/** @param {object} state */
export function clearPadsInState(state) {
    state.sandbox.pads = [];
    state.entityRegistry.clear("pad");
}
/** @param {object[]} worldProps @param {number} worldX @param {number} worldY @param {number} padding */
function nearestWorldPropInList(worldProps, worldX, worldY, padding) {
    let best = null;
    let bestDistSq = Infinity;
    for (let i = 0; i < worldProps.length; i++) {
        const prop = worldProps[i];
        if (prop.isDead) continue;
        const tapRadius = prop.radius + padding;
        const distSq = (prop.x - worldX) ** 2 + (prop.y - worldY) ** 2;
        if (distSq <= tapRadius * tapRadius && distSq < bestDistSq) {
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
    const searchPad = padding + 48;
    const candidates = registry.queryView({ bounds: { minX: worldX - searchPad, minY: worldY - searchPad, maxX: worldX + searchPad, maxY: worldY + searchPad }, kinds: ["worldProp"] }, spatialFrame);
    return nearestWorldPropInList(candidates, worldX, worldY, padding);
}
