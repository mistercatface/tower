import { clearGroundRollDrive } from "../../Sandbox/kineticRollActuator.js";
import { createSnakeGoalIndex, rebuildSnakeGoalIndex } from "./snakeGoalIndex.js";
export function retireSnakeSegmentsFromNav(state, memberIds) {
    for (let i = 0; i < memberIds.length; i++) {
        const prop = state.entityRegistry.getLive(memberIds[i]);
        if (!prop) continue;
        clearGroundRollDrive(prop);
        prop.navStepPenalty = null;
    }
}
export function wireSnakeGameRegistry(state, registry, autosimsByHeadId, navWalkable) {
    state.sandbox.snakeGame = { registry, autosimsByHeadId, navWalkable, goalIndex: createSnakeGoalIndex(), simTick: 0, lastVisionBeginTick: -1 };
    rebuildSnakeGoalIndex(state);
}
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
export function buildAliveSnakeMemberHeadMap(registry, orderedMemberIdsForHead) {
    const memberToHead = new Map();
    for (const headId of registry.aliveByHeadId.keys()) {
        const members = orderedMemberIdsForHead(headId);
        for (let i = 0; i < members.length; i++) memberToHead.set(members[i], headId);
    }
    return memberToHead;
}
