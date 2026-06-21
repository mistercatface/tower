import { getConnectedComponentPath } from "../../Motion/kineticConstraintGraph.js";
import { clearChainLinksForMembers, removeChainLinkBetween } from "../../Sandbox/chainLinks.js";
import { createSnakeAutosim } from "./snakeAutosim.js";
import { getSnakeGameConfig } from "./snakeGameConfig.js";
import { registerAliveSnake, registerInertSnake, markSnakeDead, retireSnakeSegmentsFromNav, collectSnakeInstanceMemberIds, purgeInertSnakesForHead } from "./snakeLifecycle.js";
export class SnakeInstance {
    constructor({ headId, spawnGroupId, autosim = null, lifecycle = "alive", memberIds = [] }) {
        this.headId = headId;
        this.spawnGroupId = spawnGroupId;
        this.autosim = autosim;
        this.lifecycle = lifecycle;
        this.memberIds = memberIds;
    }
    start() {
        this.autosim.start();
    }
    stopSteering() {
        this.autosim.stop();
    }
    syncMembersFromGraph(state) {
        this.memberIds = getConnectedComponentPath(state.kinetic, this.headId);
        return this.memberIds;
    }
    retireAllSegments(state, snakeGame, connectedMembers = null) {
        const members = connectedMembers ?? this.syncMembersFromGraph(state);
        const resolvedMembers = collectSnakeInstanceMemberIds(state, snakeGame, this.headId, members);
        retireSnakeSegmentsFromNav(state, resolvedMembers);
        return resolvedMembers;
    }
    die(state, snakeGame, members = null) {
        this.stopSteering();
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
        retireSnakeSegmentsFromNav(state, tailIds);
        registerInertSnake(snakeGame.registry, tailIds[0], tailIds, this.headId);
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
