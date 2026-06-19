export function createSnakeLifecycleRegistry() {
    return { aliveByHeadId: new Map(), inertByLeadId: new Map(), deadHeadIds: new Set() };
}
export function registerAliveSnake(registry, headId) {
    registry.aliveByHeadId.set(headId, { headId, lifecycle: "alive" });
    registry.deadHeadIds.delete(headId);
}
export function registerInertSnake(registry, leadSegmentId, memberIds) {
    registry.inertByLeadId.set(leadSegmentId, { leadSegmentId, memberIds, lifecycle: "inert" });
}
export function markSnakeDead(registry, headId) {
    registry.aliveByHeadId.delete(headId);
    registry.deadHeadIds.add(headId);
}
export function isAliveSnakeHead(registry, headId) {
    return registry.aliveByHeadId.has(headId);
}
export function resolveAliveSnakeHeadId(registry, orderedMemberIdsForHead, propId) {
    for (const headId of registry.aliveByHeadId.keys()) {
        const members = orderedMemberIdsForHead(headId);
        for (let i = 0; i < members.length; i++) if (members[i] === propId) return headId;
    }
    return null;
}
