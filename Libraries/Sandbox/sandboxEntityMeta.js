/** @typedef {"off" | "normal" | "debug"} SandboxPathVisual */
/** @typedef {"default" | "vector"} SandboxPropVisual */
/**
 * @typedef {object} SandboxEntityMeta
 * @property {string} [activeBehaviorId]
 * @property {Record<string, object>} [behaviorOverrides]
 * @property {SandboxPathVisual} [pathVisual]
 * @property {SandboxPropVisual} [propVisual]
 * @property {string} [assemblyGroupId]
 * @property {string} [assemblyRackId]
 * @property {string} [assemblyId]
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
    /** @param {number} entityId @param {import("./sandboxPropVisual.js").SandboxPropVisual} visual */
    setPropVisual(entityId, visual) {
        this.ensure(entityId).propVisual = visual;
    }
    /** @param {number} entityId */
    getPropVisual(entityId) {
        return this.get(entityId)?.propVisual;
    }
    /** @param {number} entityId */
    getAssemblyGroupId(entityId) {
        return this.get(entityId)?.assemblyGroupId;
    }
    /** @param {number} entityId @param {string} groupId @param {string} assemblyId */
    setAssemblyGroup(entityId, groupId, assemblyId) {
        const meta = this.ensure(entityId);
        meta.assemblyGroupId = groupId;
        meta.assemblyId = assemblyId;
    }
    /** @param {number} entityId */
    getAssemblyRackId(entityId) {
        return this.get(entityId)?.assemblyRackId;
    }
    /** @param {number} entityId @param {string} rackId */
    setAssemblyRackId(entityId, rackId) {
        this.ensure(entityId).assemblyRackId = rackId;
    }
    /** @param {number} entityId */
    hasAssemblyMembership(entityId) {
        const meta = this.get(entityId);
        return Boolean(meta?.assemblyGroupId || meta?.assemblyRackId);
    }
}
/** @param {object} state @param {object} entity @param {string} linkField */
export function resolveSandboxEntityLinkValue(state, entity, linkField) {
    const meta = state.sandbox?.entityMeta;
    if (!meta || entity?.id == null) return entity?.[linkField];
    if (linkField === "sandboxGroupId") return meta.getAssemblyGroupId(entity.id);
    if (linkField === "assemblyRackId") return meta.getAssemblyRackId(entity.id);
    return entity[linkField];
}
/** @param {object} state */
export function getSandboxEntityMeta(state) {
    return state.sandbox.entityMeta;
}
