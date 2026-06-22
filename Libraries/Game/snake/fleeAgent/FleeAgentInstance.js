import { getConnectedComponentPath } from "../../../Motion/kineticConstraintGraph.js";
import { registerAliveAgent, markAgentDead } from "../agentPopulationRegistry.js";
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
    validate(state, snakeGame) {
        if (this.lifecycle !== "alive") return;
        const head = state.entityRegistry.getLive(this.headId);
        if (!head || head.isDead) this.die(state, snakeGame);
    }
    die(state, snakeGame) {
        this.lifecycle = "dead";
        markAgentDead(snakeGame.registry, this.headId);
        if (snakeGame.onHeadDied) snakeGame.onHeadDied(this.headId);
    }
}
export function createFleeAgentInstance(state, { headId, wedgeId, spawnGroupId }) {
    const instance = new FleeAgentInstance({ headId, wedgeId, spawnGroupId });
    instance.syncMembersFromGraph(state);
    return instance;
}
export function registerFleeAgentInstance(snakeGame, instance) {
    registerAliveAgent(snakeGame.registry, instance.headId, "flee_agent", instance);
}
export function getFleeAgentInstance(snakeGame, headId) {
    return snakeGame.instancesByHeadId.get(headId) ?? null;
}
export function syncFleeAgentInstances(state, snakeGame) {
    for (const instance of snakeGame.instancesByHeadId.values()) {
        if (instance.lifecycle !== "alive" || instance.validate === undefined) continue;
        // FleeAgentInstance satisfies validate and syncMembersFromGraph
        if (typeof instance.syncMembersFromGraph === "function") instance.syncMembersFromGraph(state);
    }
}
export function syncFleeAgentWedgeFacings(state, snakeGame) {
    for (const instance of snakeGame.instancesByHeadId.values()) if (instance.lifecycle === "alive" && typeof instance.syncWedgeFacing === "function") instance.syncWedgeFacing(state);
}
