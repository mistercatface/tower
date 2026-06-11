/**
 * @param {object} entity
 * @param {string} groupId
 * @param {string} assemblyId
 * @param {string} groupField
 */
export function stampAssemblyGroupMember(entity, groupId, assemblyId, groupField) {
    entity[groupField] = groupId;
    entity.sandboxAssemblyId = assemblyId;
}
/** @param {object} entity @param {string} groupId @param {string} groupField */
export function entityBelongsToAssemblyGroup(entity, groupId, groupField) {
    return entity[groupField] === groupId;
}
