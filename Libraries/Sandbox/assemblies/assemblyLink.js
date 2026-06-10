/**
 * @param {object} entity
 * @param {string} groupId
 * @param {string} assemblyId
 * @param {string} groupField
 */
export function stampAssemblyGroupMember(entity, groupId, assemblyId, groupField) {
    entity[groupField] = groupId;
    entity.sandboxAssemblyId = assemblyId;
    if (groupField === "sandboxGroupId") entity.sandboxPoolTableId = groupId;
}
/** @param {object} entity @param {string} groupId @param {string} [groupField] */
export function entityBelongsToAssemblyGroup(entity, groupId, groupField = "sandboxGroupId") {
    if (!entity || groupId == null) return false;
    return entity[groupField] === groupId || entity.sandboxPoolTableId === groupId;
}
