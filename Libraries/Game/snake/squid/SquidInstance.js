import { getConnectedBodyIds, getLinearChainOrderedMembers } from "../../../Motion/kineticConstraintGraph.js";
import { getSandboxEntityMeta } from "../../../../GameState/sandboxEntityMeta.js";
import { grantSnakeSteeringLease, revokeSnakeSteeringLease } from "../snakeSteeringLease.js";
import { reapAgentInstance } from "../snakeAgentLifecycle.js";

export class SquidInstance {
    constructor({ headId, spawnGroupId, autosim = null, lifecycle = "alive" }) {
        this.headId = headId;
        this.spawnGroupId = spawnGroupId;
        this.autosim = autosim;
        this.lifecycle = lifecycle;
        this.memberIds = [];
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
    tick(state, dtMs) {
        if (this.autosim) this.autosim.tick(dtMs);
    }
    isSteerable(state, registry) {
        if (this.lifecycle !== "alive" || !registry.aliveByHeadId.has(this.headId)) return false;
        const brain = state.entityRegistry.getLive(this.headId);
        if (!brain) return false;
        if (!getSandboxEntityMeta(state).isChainHead(this.headId)) return false;
        const members = getConnectedBodyIds(state.kinetic, this.headId);
        return members.includes(this.headId);
    }
    validate(state, snakeGame) {
        if (this.lifecycle !== "alive") return;
        const brain = state.entityRegistry.getLive(this.headId);
        if (!brain) {
            this.die(state, snakeGame);
            return;
        }
        const members = getConnectedBodyIds(state.kinetic, this.headId);
        if (!members.includes(this.headId)) this.die(state, snakeGame);
    }
    syncMembersFromGraph(state) {
        this.memberIds = getConnectedBodyIds(state.kinetic, this.headId);
        return this.memberIds;
    }
    orderedMembers(state) {
        return getLinearChainOrderedMembers(state.kinetic, this.headId);
    }
    /** Squid stays in one piece — no tail splits like snakes. */
    splitAtStruckSegment() {
        return null;
    }
    updatePressureDiagnostics() {}
    die(state, snakeGame, members = null, deathImpact = null) {
        reapAgentInstance(state, snakeGame, this, deathImpact);
    }
}

export function getSquidInstance(snakeGame, headId) {
    return snakeGame.instancesByHeadId.get(headId) ?? null;
}
