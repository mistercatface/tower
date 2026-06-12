/** @typedef {{ minX: number, minY: number, maxX: number, maxY: number }} BoundsRect */
/** @typedef {{ kind: string, ref: object }} EntityRegistryEntry */
/**
 * @typedef {Object} QueryViewCriteria
 * @property {BoundsRect} bounds
 * @property {string[]} [kinds]
 * @property {string} [filterId] — cache key segment for optional `match`
 * @property {(ref: object) => boolean} [match]
 */
const EMPTY_KINDS = ["worldProp"];
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
/** @param {import("../Libraries/Viewport/Viewport.js").Viewport} viewport */
export function viewportVisibleBounds(viewport) {
    const b = viewport.boundsVisibleDefault;
    return { minX: b.minX, minY: b.minY, maxX: b.maxX, maxY: b.maxY };
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
     * Demand-built bounds query, tick-scoped via spatialGen.
     *
     * @param {QueryViewCriteria} criteria
     * @param {import("../Libraries/Spatial/world/SpatialFrameCore.js").SpatialFrameCore | null | undefined} spatialFrame
     * @returns {object[]}
     */
    queryView(criteria, spatialFrame) {
        const kinds = criteria.kinds ?? EMPTY_KINDS;
        const kindSet = new Set(kinds);
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
        result = spatialFrame ? this._querySpatial(criteria.bounds, kindSet, criteria.match, spatialFrame) : this._queryFallback(criteria.bounds, kindSet, criteria.match);
        this._queryCache.set(cacheKey, { result, spatialGen, membershipGen: this.membershipGen });
        return result;
    }
    /** @param {BoundsRect} bounds @param {Set<string>} kindSet @param {((ref: object) => boolean) | undefined} match @param {import("../Libraries/Spatial/world/SpatialFrameCore.js").SpatialFrameCore} spatialFrame */
    _querySpatial(bounds, kindSet, match, spatialFrame) {
        const entities = spatialFrame.collectEntitiesInBounds(bounds.minX, bounds.minY, bounds.maxX, bounds.maxY);
        const result = [];
        for (let i = 0; i < entities.length; i++) {
            const entity = entities[i];
            const entry = this._entries.get(entity.id);
            if (!entry || !kindSet.has(entry.kind)) continue;
            const ref = entry.ref;
            if (ref.isDead) continue;
            if (match && !match(ref)) continue;
            result.push(ref);
        }
        return result;
    }
    /** @param {BoundsRect} bounds @param {Set<string>} kindSet @param {((ref: object) => boolean) | undefined} match */
    _queryFallback(bounds, kindSet, match) {
        const result = [];
        for (const entry of this._entries.values()) {
            if (!kindSet.has(entry.kind)) continue;
            const ref = entry.ref;
            if (ref.isDead) continue;
            const r = ref.getBoundingRadius?.() ?? ref.radius ?? 0;
            if (ref.x + r < bounds.minX || ref.x - r > bounds.maxX || ref.y + r < bounds.minY || ref.y - r > bounds.maxY) continue;
            if (match && !match(ref)) continue;
            result.push(ref);
        }
        return result;
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
}
/** @param {object} state @param {object} pad */
export function addPadToState(state, pad) {
    state.sandboxPads.push(pad);
    state.entityRegistry.register("pad", pad);
}
/** @param {object} state @param {object} pad */
export function removePadFromState(state, pad) {
    const index = state.sandboxPads.indexOf(pad);
    if (index >= 0) state.sandboxPads.splice(index, 1);
    state.entityRegistry.unregister(pad);
}
/** @param {object} state */
export function clearWorldPropsInState(state) {
    state.worldProps = [];
    state.entityRegistry.clear("worldProp");
}
/** @param {object} state */
export function clearPadsInState(state) {
    state.sandboxPads = [];
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
