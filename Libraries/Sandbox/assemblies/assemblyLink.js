import { getSandboxEntityMeta } from "../sandboxEntityMeta.js";
/**
 * Stamp assembly membership on scene-graph objects (walls, zones, guides).
 *
 * @param {object} entity
 * @param {string} groupId
 * @param {string} assemblyId
 * @param {string} groupField
 */
export function stampAssemblySceneMember(entity, groupId, assemblyId, groupField) {
    entity[groupField] = groupId;
    entity.sandboxAssemblyId = assemblyId;
}
/**
 * Stamp assembly membership on sim entities (world props, pads) via sandbox meta store.
 *
 * @param {object} state
 * @param {object} entity
 * @param {string} groupId
 * @param {string} assemblyId
 * @param {string} groupField
 */
export function stampAssemblyEntityMember(state, entity, groupId, assemblyId, groupField) {
    if (groupField !== "sandboxGroupId") throw new Error(`Unsupported assembly group field "${groupField}" for entity meta`);
    const meta = getSandboxEntityMeta(state);
    meta.setAssemblyGroup(entity.id, groupId, assemblyId);
}
/** @param {object} state @param {object} entity @param {string} groupId @param {string} groupField */
export function entityBelongsToAssemblyGroup(state, entity, groupId, groupField) {
    if (groupField === "sandboxGroupId") return getSandboxEntityMeta(state).getAssemblyGroupId(entity.id) === groupId;
    return entity[groupField] === groupId;
}
