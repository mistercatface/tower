import { getConnectedComponentPath } from "../../Motion/kineticConstraintGraph.js";
import { getSandboxEntityMeta } from "../../../GameState/sandboxEntityMeta.js";
import { clearGroundRollDrive } from "../../Sandbox/kineticRollActuator.js";
import { createSnakeGoalIndex, rebuildSnakeGoalIndex } from "./snakeGoalIndex.js";
import { getSnakeGameConfig, resolveSnakeHeadBodyMaxDistance } from "./snakeGameConfig.js";
import { SNAKE_CHAIN_EXPORT_TYPE } from "./snakeScene.js";
export function isSnakeHeadPhysicallyAttached(state, headId) {
    const maxDistance = resolveSnakeHeadBodyMaxDistance();
    const members = getConnectedComponentPath(state.kinetic, headId);
    if (members.length < getSnakeGameConfig().minAliveSegmentCount) return false;
    for (let i = 0; i < members.length - 1; i++) {
        const a = state.entityRegistry.getLive(members[i]);
        const b = state.entityRegistry.getLive(members[i + 1]);
        if (!a || !b) return false;
        if (Math.hypot(b.x - a.x, b.y - a.y) > maxDistance) return false;
    }
    return true;
}
export function retireSnakeSegmentsFromNav(state, memberIds) {
    const meta = getSandboxEntityMeta(state);
    for (let i = 0; i < memberIds.length; i++) {
        const prop = state.entityRegistry.getLive(memberIds[i]);
        if (!prop) continue;
        meta.setChainHead(memberIds[i], false);
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
export function registerInertSnake(registry, leadSegmentId, memberIds, sourceHeadId) {
    registry.inertByLeadId.set(leadSegmentId, { leadSegmentId, memberIds, sourceHeadId, lifecycle: "inert" });
}
export function markSnakeDead(registry, headId) {
    registry.aliveByHeadId.delete(headId);
    registry.deadHeadIds.add(headId);
}
export function isAliveSnakeHead(registry, headId) {
    return registry.aliveByHeadId.has(headId);
}
export function isValidAliveSnakeHead(state, registry, headId) {
    if (!registry.aliveByHeadId.has(headId)) return false;
    const head = state.entityRegistry.getLive(headId);
    const meta = getSandboxEntityMeta(state);
    if (!head || !meta.isChainHead(headId)) return false;
    const members = getConnectedComponentPath(state.kinetic, headId);
    if (members[0] !== headId) return false;
    if (members.length < getSnakeGameConfig().minAliveSegmentCount) return false;
    return isSnakeHeadPhysicallyAttached(state, headId);
}
export function collectSnakeSpawnGroupMemberIds(state, headId) {
    const meta = getSandboxEntityMeta(state);
    const spawnGroupId = meta.getSpawnGroupId(headId);
    if (!spawnGroupId) return [];
    const ids = [];
    for (let i = 0; i < state.worldProps.length; i++) {
        const prop = state.worldProps[i];
        if (meta.getSpawnGroupId(prop.id) !== spawnGroupId) continue;
        if (meta.getSpawnGroupExportType(prop.id) !== SNAKE_CHAIN_EXPORT_TYPE) continue;
        ids.push(prop.id);
    }
    return ids;
}
export function collectSnakeInstanceMemberIds(state, snakeGame, headId, connectedMembers) {
    const ids = new Set(connectedMembers);
    const spawnGroupIds = collectSnakeSpawnGroupMemberIds(state, headId);
    for (let i = 0; i < spawnGroupIds.length; i++) ids.add(spawnGroupIds[i]);
    for (const entry of snakeGame.registry.inertByLeadId.values()) {
        if (entry.sourceHeadId !== headId) continue;
        for (let i = 0; i < entry.memberIds.length; i++) ids.add(entry.memberIds[i]);
    }
    return [...ids];
}
export function purgeInertSnakesForHead(registry, headId) {
    for (const [leadId, entry] of registry.inertByLeadId) if (entry.sourceHeadId === headId) registry.inertByLeadId.delete(leadId);
}
export function sweepOrphanSnakeChains(state, snakeGame) {
    const meta = getSandboxEntityMeta(state);
    const registry = snakeGame.registry;
    const claimed = new Set();
    for (const headId of registry.aliveByHeadId.keys()) {
        const members = getConnectedComponentPath(state.kinetic, headId);
        for (let i = 0; i < members.length; i++) claimed.add(members[i]);
    }
    for (const entry of registry.inertByLeadId.values()) for (let i = 0; i < entry.memberIds.length; i++) claimed.add(entry.memberIds[i]);
    const processed = new Set();
    for (let i = 0; i < state.worldProps.length; i++) {
        const prop = state.worldProps[i];
        if (meta.getSpawnGroupExportType(prop.id) !== SNAKE_CHAIN_EXPORT_TYPE) continue;
        if (claimed.has(prop.id) || processed.has(prop.id)) continue;
        const members = getConnectedComponentPath(state.kinetic, prop.id);
        for (let j = 0; j < members.length; j++) processed.add(members[j]);
        let hasValidSteeredHead = false;
        for (let j = 0; j < members.length; j++) {
            const memberId = members[j];
            if (registry.aliveByHeadId.has(memberId) && meta.isChainHead(memberId) && isValidAliveSnakeHead(state, registry, memberId)) {
                hasValidSteeredHead = true;
                break;
            }
        }
        if (hasValidSteeredHead) continue;
        retireSnakeSegmentsFromNav(state, members);
    }
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
