import { getConnectedComponentPath } from "../../../Motion/kineticConstraintGraph.js";
import { syncFleeAgentWedgeFacing } from "./syncFleeAgentWedgeFacing.js";
export class FleeAgentInstance {
    constructor({ headId, wedgeId, spawnGroupId }) {
        this.headId = headId;
        this.wedgeId = wedgeId;
        this.spawnGroupId = spawnGroupId;
        this.lifecycle = "alive";
    }
    syncMembersFromGraph(state) {
        const members = getConnectedComponentPath(state.kinetic, this.headId);
        this.wedgeId = members[1] ?? this.wedgeId;
        return members;
    }
    syncWedgeFacing(state) {
        if (this.lifecycle !== "alive") return false;
        const body = state.entityRegistry.getLive(this.headId);
        const wedge = state.entityRegistry.getLive(this.wedgeId);
        if (!body || !wedge || body.isDead || wedge.isDead) return false;
        return syncFleeAgentWedgeFacing(body, wedge);
    }
}
export function createFleeAgentInstance(state, { headId, wedgeId, spawnGroupId }) {
    const instance = new FleeAgentInstance({ headId, wedgeId, spawnGroupId });
    instance.syncMembersFromGraph(state);
    return instance;
}
export function registerFleeAgentInstance(snakeGame, instance) {
    snakeGame.fleeAgents.instancesByHeadId.set(instance.headId, instance);
    snakeGame.fleeAgents.aliveByHeadId.set(instance.headId, instance);
}
export function getFleeAgentInstance(snakeGame, headId) {
    return snakeGame.fleeAgents.instancesByHeadId.get(headId) ?? null;
}
export function syncFleeAgentInstances(state, snakeGame) {
    for (const instance of snakeGame.fleeAgents.instancesByHeadId.values()) {
        if (instance.lifecycle !== "alive") continue;
        instance.syncMembersFromGraph(state);
    }
}
export function syncFleeAgentWedgeFacings(state, snakeGame) {
    for (const instance of snakeGame.fleeAgents.aliveByHeadId.values()) instance.syncWedgeFacing(state);
}
