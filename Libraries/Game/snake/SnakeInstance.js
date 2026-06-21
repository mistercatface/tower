import { getConnectedComponentPath } from "../../Motion/kineticConstraintGraph.js";
import { clearChainLinksForMembers, removeChainLinkBetween } from "../../Sandbox/chainLinks.js";
import { createSnakeAutosim } from "./snakeAutosim.js";
import { getSnakeGameConfig } from "./snakeGameConfig.js";
import { grantSnakeSteeringLease, revokeSnakeSteeringLease } from "./snakeSteeringLease.js";
import { registerAliveSnake, registerInertSnake, markSnakeDead, retireSnakeSegmentsFromNav, collectSnakeInstanceMemberIds, purgeInertSnakesForHead, isValidAliveSnakeHead } from "./snakeLifecycle.js";
export class SnakeInstance {
    constructor({ headId, spawnGroupId, autosim = null, lifecycle = "alive", memberIds = [] }) {
        this.headId = headId;
        this.spawnGroupId = spawnGroupId;
        this.autosim = autosim;
        this.lifecycle = lifecycle;
        this.memberIds = memberIds;
        this.steeringEpoch = 0;
    }
    start(state) {
        grantSnakeSteeringLease(this, state);
        this.autosim.start();
    }
    stopSteering(state) {
        revokeSnakeSteeringLease(this, state);
        this.autosim.stop();
    }
    isSteerable(state, registry) {
        return isValidAliveSnakeHead(state, registry, this.headId);
    }
    validate(state, snakeGame) {
        if (this.lifecycle !== "alive") return;
        if (this.isSteerable(state, snakeGame.registry)) return;
        this.die(state, snakeGame);
    }
    syncMembersFromGraph(state) {
        this.memberIds = getConnectedComponentPath(state.kinetic, this.headId);
        return this.memberIds;
    }
    retireMemberSegments(state, memberIds) {
        retireSnakeSegmentsFromNav(state, memberIds);
    }
    retireAllSegments(state, snakeGame, connectedMembers = null) {
        const members = connectedMembers ?? this.syncMembersFromGraph(state);
        const resolvedMembers = collectSnakeInstanceMemberIds(state, snakeGame, this.headId, members);
        this.retireMemberSegments(state, resolvedMembers);
        return resolvedMembers;
    }
    severInertTail(state, snakeGame, tailIds) {
        this.retireMemberSegments(state, tailIds);
        registerInertSnake(snakeGame.registry, tailIds[0], tailIds, this.headId);
    }
    die(state, snakeGame, members = null) {
        this.stopSteering(state);
        snakeGame.autosimsByHeadId.delete(this.headId);
        const connectedMembers = members ?? getConnectedComponentPath(state.kinetic, this.headId);
        const resolvedMembers = this.retireAllSegments(state, snakeGame, connectedMembers);
        clearChainLinksForMembers(state, resolvedMembers);
        purgeInertSnakesForHead(snakeGame.registry, this.headId);
        markSnakeDead(snakeGame.registry, this.headId);
        this.lifecycle = "dead";
        snakeGame.instancesByHeadId.delete(this.headId);
        if (snakeGame.onHeadDied) snakeGame.onHeadDied(this.headId);
    }
    splitAtStruckSegment(state, snakeGame, struckSegmentId, victimMembers = null) {
        const members = victimMembers ?? getConnectedComponentPath(state.kinetic, this.headId);
        const strikeIndex = members.indexOf(struckSegmentId);
        if (strikeIndex < 0 || strikeIndex >= members.length - 1) return null;
        const linkA = members[strikeIndex];
        const linkB = members[strikeIndex + 1];
        if (!removeChainLinkBetween(state, linkA, linkB)) return null;
        const aliveIds = members.slice(0, strikeIndex + 1);
        const tailIds = members.slice(strikeIndex + 1);
        this.severInertTail(state, snakeGame, tailIds);
        this.memberIds = aliveIds;
        if (aliveIds.length < getSnakeGameConfig().minAliveSegmentCount) this.die(state, snakeGame, aliveIds);
        return { aliveHeadId: this.headId, aliveIds, inertLeadId: tailIds[0], inertIds: tailIds };
    }
}
export function createAliveSnakeInstance(state, { headId, spawnGroupId, navWalkable }) {
    const autosim = createSnakeAutosim(state, { headId, navWalkable });
    const instance = new SnakeInstance({ headId, spawnGroupId, autosim, lifecycle: "alive" });
    instance.syncMembersFromGraph(state);
    return instance;
}
export function registerAliveSnakeInstance(snakeGame, instance) {
    registerAliveSnake(snakeGame.registry, instance.headId);
    snakeGame.instancesByHeadId.set(instance.headId, instance);
    snakeGame.autosimsByHeadId.set(instance.headId, instance.autosim);
}
export function getSnakeInstance(snakeGame, headId) {
    return snakeGame.instancesByHeadId?.get(headId) ?? null;
}
export function buildSnakeMemberToInstanceMap(state, snakeGame) {
    const map = new Map();
    const instances = snakeGame.instancesByHeadId;
    if (!instances) return map;
    for (const instance of instances.values()) {
        if (instance.lifecycle !== "alive") continue;
        const members = getConnectedComponentPath(state.kinetic, instance.headId);
        instance.memberIds = members;
        for (let i = 0; i < members.length; i++) map.set(members[i], instance);
    }
    return map;
}
export function resolveSnakeInstanceForMember(state, snakeGame, memberId) {
    const instance = getSnakeInstance(snakeGame, memberId);
    if (instance && instance.lifecycle === "alive") return instance;
    const map = buildSnakeMemberToInstanceMap(state, snakeGame);
    return map.get(memberId) ?? null;
}
