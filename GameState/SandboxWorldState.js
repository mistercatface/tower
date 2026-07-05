import { CellPropIndex } from "../Libraries/Spatial/spatial.js";
/** @typedef {"off" | "normal" | "debug"} SandboxPathVisual */
/**
 * @typedef {object} SandboxEntityMeta
 * @property {string} [activeBehaviorId]
 * @property {Record<string, object>} [behaviorOverrides]
 * @property {SandboxPathVisual} [pathVisual]
 * @property {string} [spawnGroupId]
 * @property {string} [spawnGroupExportType]
 * @property {boolean} [spawnGroupAnchor]
 * @property {boolean} [chainHead]
 */
export class SandboxEntityMetaStore {
    constructor() {
        /** @type {Map<number, SandboxEntityMeta>} */
        this.byEntityId = new Map();
        /** @type {number | null} */
        this.cameraTargetId = null;
    }
    get(entityId) {
        return this.byEntityId.get(entityId) ?? null;
    }
    ensure(entityId) {
        let meta = this.byEntityId.get(entityId);
        if (!meta) {
            meta = {};
            this.byEntityId.set(entityId, meta);
        }
        return meta;
    }
    delete(entityId) {
        if (this.cameraTargetId === entityId) this.cameraTargetId = null;
        this.byEntityId.delete(entityId);
    }
    clear() {
        this.byEntityId.clear();
        this.cameraTargetId = null;
    }
    getActiveBehaviorId(entityId) {
        return this.get(entityId)?.activeBehaviorId;
    }
    setActiveBehaviorId(entityId, behaviorId) {
        this.ensure(entityId).activeBehaviorId = behaviorId;
    }
    getBehaviorOverrides(entityId) {
        return this.get(entityId)?.behaviorOverrides;
    }
    setBehaviorOverrides(entityId, overrides) {
        this.ensure(entityId).behaviorOverrides = overrides;
    }
    isCameraTarget(entityId) {
        return this.cameraTargetId === entityId;
    }
    setCameraTarget(entityId, enabled) {
        if (enabled) this.cameraTargetId = entityId;
        else if (this.cameraTargetId === entityId) this.cameraTargetId = null;
    }
    findCameraTargetEntityId() {
        return this.cameraTargetId;
    }
    setPathVisual(entityId, visual) {
        this.ensure(entityId).pathVisual = visual;
    }
    getPathVisual(entityId) {
        return this.get(entityId)?.pathVisual;
    }
    getSpawnGroupId(entityId) {
        return this.get(entityId)?.spawnGroupId;
    }
    setSpawnGroupId(entityId, spawnGroupId) {
        this.ensure(entityId).spawnGroupId = spawnGroupId;
    }
    getSpawnGroupExportType(entityId) {
        return this.get(entityId)?.spawnGroupExportType;
    }
    setSpawnGroupExportType(entityId, exportType) {
        this.ensure(entityId).spawnGroupExportType = exportType;
    }
    isSpawnGroupAnchor(entityId) {
        return this.get(entityId)?.spawnGroupAnchor === true;
    }
    setSpawnGroupAnchor(entityId, anchor = true) {
        this.ensure(entityId).spawnGroupAnchor = anchor;
    }
    isChainHead(entityId) {
        return this.get(entityId)?.chainHead === true;
    }
    setChainHead(entityId, head = true) {
        if (head) this.ensure(entityId).chainHead = true;
        else if (this.get(entityId)) this.get(entityId).chainHead = false;
    }
}
export const sandboxFactions = { alpha: "alpha", bravo: "bravo", charlie: "charlie", delta: "delta", echo: "echo" };
export const SANDBOX_DEFAULT_FACTION = sandboxFactions.alpha;
export const SANDBOX_FACTION_OPTIONS = [
    { id: sandboxFactions.alpha, label: "Alpha" },
    { id: sandboxFactions.bravo, label: "Bravo" },
    { id: sandboxFactions.charlie, label: "Charlie" },
    { id: sandboxFactions.delta, label: "Delta" },
    { id: sandboxFactions.echo, label: "Echo" },
];
export function resolveSandboxFaction(actor) {
    return actor?.faction ?? SANDBOX_DEFAULT_FACTION;
}
export function formatSandboxFactionLabel(factionId) {
    return SANDBOX_FACTION_OPTIONS.find((opt) => opt.id === factionId)?.label ?? factionId;
}
export function resolveSandboxEntityLinkValue(state, entity, linkField) {
    const meta = state.sandbox?.entityMeta;
    if (!meta || entity?.id == null) return entity?.[linkField];
    if (linkField === "spawnGroupId") return meta.getSpawnGroupId(entity.id);
    return entity[linkField];
}
/** Sandbox playfield data — per-entity editor metadata. */
export class SandboxWorldState {
    constructor() {
        this.entityMeta = new SandboxEntityMetaStore();
        /** @type {object | null} */
        this.controller = null;
        /** @type {Map<string, CellPropIndex>} */
        this.propCategoryIndexes = new Map();
    }
}
export function getPropCategoryIndex(state, categoryId) {
    let index = state.sandbox.propCategoryIndexes.get(categoryId);
    if (!index) {
        index = new CellPropIndex();
        state.sandbox.propCategoryIndexes.set(categoryId, index);
        if (!state.obstacleGrid.onBoundsResync)
            state.obstacleGrid.onBoundsResync = (grid) => {
                for (const idx of state.sandbox.propCategoryIndexes.values()) idx.syncBounds(grid);
            };
        index.syncBounds(state.obstacleGrid);
    }
    return index;
}
export function unregisterPropFromCategoryIndexes(state, prop) {
    if (!state.sandbox?.propCategoryIndexes) return;
    for (const index of state.sandbox.propCategoryIndexes.values()) index.unregister(prop);
}
