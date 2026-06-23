import { getConnectedComponentPath } from "../../../Motion/kineticConstraintGraph.js";
import { reapAgentInstance } from "../snakeAgentLifecycle.js";
import { AGENT_PROFILE } from "../../../AI/agents/agentProfile.js";
import { grantSnakeSteeringLease, revokeSnakeSteeringLease } from "../snakeSteeringLease.js";
import { getAgentIdentity } from "../../../AI/identity/agentIdentity.js";
import { syncFleeAgentPresentation } from "./syncFleeAgentPresentation.js";
import { createAgentAutosim } from "../agentAutosim.js";
export class FleeAgentInstance {
    constructor({ headId, spawnGroupId, autosim }) {
        this.headId = headId;
        this.spawnGroupId = spawnGroupId;
        this.lifecycle = "alive";
        this.autosim = autosim;
        this.baseTint = getAgentIdentity(headId)?.color ?? null;
        this._sprintOverride = undefined;
        this._intentOverride = undefined;
    }
    get intent() {
        if (this._intentOverride !== undefined) return this._intentOverride;
        return this.autosim?.getIntent() ?? null;
    }
    set intent(value) {
        this._intentOverride = value;
    }
    get sprinting() {
        if (this._sprintOverride !== undefined) return this._sprintOverride;
        return this.autosim?.isSprinting() ?? false;
    }
    set sprinting(value) {
        this._sprintOverride = value;
    }
    get brain() {
        return this.autosim?.getBrain() ?? null;
    }
    get headNav() {
        return this.autosim?.getHeadNav() ?? null;
    }
    start(state) {
        grantSnakeSteeringLease(this, state);
        this.autosim.start();
        const head = state.entityRegistry.getLive(this.headId);
        if (head) syncFleeAgentPresentation(head, { baseTint: this.baseTint });
    }
    stopSteering(state) {
        revokeSnakeSteeringLease(this, state);
        this.autosim.stop();
    }
    tick(state, dtMs) {
        if (this.lifecycle !== "alive" || !this.autosim.isActive()) return;
        this.autosim.tick(dtMs);
        const head = state.entityRegistry.getLive(this.headId);
        if (head) syncFleeAgentPresentation(head, { baseTint: this.baseTint });
    }
    syncMembersFromGraph(state) {
        return getConnectedComponentPath(state.kinetic, this.headId);
    }
    validate(state, snakeGame) {
        if (this.lifecycle !== "alive") return;
        const head = state.entityRegistry.getLive(this.headId);
        if (!head || head.isDead) this.die(state, snakeGame);
    }
    die(state, snakeGame, members = null, deathImpact = null) {
        reapAgentInstance(state, snakeGame, this, deathImpact);
    }
}
export function createFleeAgentInstance(state, { headId, spawnGroupId, navWalkable = null }) {
    const resolvedNav = navWalkable ?? state.sandbox?.snakeGame?.navWalkable;
    const autosim = createAgentAutosim(state, { profileId: AGENT_PROFILE.flee, leaderId: headId, navWalkable: resolvedNav });
    const instance = new FleeAgentInstance({ headId, spawnGroupId, autosim });
    instance.syncMembersFromGraph(state);
    return instance;
}
export function getFleeAgentInstance(snakeGame, headId) {
    return snakeGame.instancesByHeadId.get(headId) ?? null;
}
