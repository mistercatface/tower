/** @typedef {"off" | "normal" | "debug"} SandboxPathVisual */
/** @typedef {"default" | "vector"} SandboxPropVisual */
/**
 * @typedef {object} SandboxEntityMeta
 * @property {string} [activeBehaviorId]
 * @property {Record<string, object>} [behaviorOverrides]
 * @property {SandboxPathVisual} [pathVisual]
 * @property {SandboxPropVisual} [propVisual]
 * @property {string} [spawnGroupId]
 * @property {string} [spawnGroupExportType]
 * @property {boolean} [spawnGroupAnchor]
 */
export class SandboxEntityMetaStore {
    constructor() {
        /** @type {Map<number, SandboxEntityMeta>} */
        this.byEntityId = new Map();
        /** @type {number | null} */
        this.cameraTargetId = null;
    }
    /** @param {number} entityId */
    get(entityId) {
        return this.byEntityId.get(entityId) ?? null;
    }
    /** @param {number} entityId */
    ensure(entityId) {
        let meta = this.byEntityId.get(entityId);
        if (!meta) {
            meta = {};
            this.byEntityId.set(entityId, meta);
        }
        return meta;
    }
    /** @param {number} entityId */
    delete(entityId) {
        if (this.cameraTargetId === entityId) this.cameraTargetId = null;
        this.byEntityId.delete(entityId);
    }
    clear() {
        this.byEntityId.clear();
        this.cameraTargetId = null;
    }
    /** @param {number} entityId */
    getActiveBehaviorId(entityId) {
        return this.get(entityId)?.activeBehaviorId;
    }
    /** @param {number} entityId @param {string} behaviorId */
    setActiveBehaviorId(entityId, behaviorId) {
        this.ensure(entityId).activeBehaviorId = behaviorId;
    }
    /** @param {number} entityId */
    getBehaviorOverrides(entityId) {
        return this.get(entityId)?.behaviorOverrides;
    }
    /** @param {number} entityId @param {Record<string, object>} overrides */
    setBehaviorOverrides(entityId, overrides) {
        this.ensure(entityId).behaviorOverrides = overrides;
    }
    /** @param {number} entityId */
    isCameraTarget(entityId) {
        return this.cameraTargetId === entityId;
    }
    /** @param {number} entityId @param {boolean} enabled */
    setCameraTarget(entityId, enabled) {
        if (enabled) this.cameraTargetId = entityId;
        else if (this.cameraTargetId === entityId) this.cameraTargetId = null;
    }
    /** @returns {number | null} */
    findCameraTargetEntityId() {
        return this.cameraTargetId;
    }
    /** @param {number} entityId @param {SandboxPathVisual} visual */
    setPathVisual(entityId, visual) {
        this.ensure(entityId).pathVisual = visual;
    }
    /** @param {number} entityId */
    getPathVisual(entityId) {
        return this.get(entityId)?.pathVisual;
    }
    /** @param {number} entityId @param {SandboxPropVisual} visual */
    setPropVisual(entityId, visual) {
        this.ensure(entityId).propVisual = visual;
    }
    /** @param {number} entityId */
    getPropVisual(entityId) {
        return this.get(entityId)?.propVisual;
    }
    /** @param {number} entityId */
    getSpawnGroupId(entityId) {
        return this.get(entityId)?.spawnGroupId;
    }
    /** @param {number} entityId @param {string} spawnGroupId */
    setSpawnGroupId(entityId, spawnGroupId) {
        this.ensure(entityId).spawnGroupId = spawnGroupId;
    }
    /** @param {number} entityId */
    getSpawnGroupExportType(entityId) {
        return this.get(entityId)?.spawnGroupExportType;
    }
    /** @param {number} entityId @param {string} exportType */
    setSpawnGroupExportType(entityId, exportType) {
        this.ensure(entityId).spawnGroupExportType = exportType;
    }
    /** @param {number} entityId */
    isSpawnGroupAnchor(entityId) {
        return this.get(entityId)?.spawnGroupAnchor === true;
    }
    /** @param {number} entityId @param {boolean} [anchor] */
    setSpawnGroupAnchor(entityId, anchor = true) {
        this.ensure(entityId).spawnGroupAnchor = anchor;
    }
}
/** @param {object} state @param {object} entity @param {string} linkField */
export function resolveSandboxEntityLinkValue(state, entity, linkField) {
    const meta = state.sandbox?.entityMeta;
    if (!meta || entity?.id == null) return entity?.[linkField];
    if (linkField === "spawnGroupId") return meta.getSpawnGroupId(entity.id);
    return entity[linkField];
}
/** @param {object} state */
export function getSandboxEntityMeta(state) {
    return state.sandbox.entityMeta;
}
