import { getConnectedComponentPath } from "../../../Motion/kineticConstraintGraph.js";
import { tickAgentIntent, reapAgentInstance } from "../snakeAgentLifecycle.js";
import { syncFleeBallTurretFacing } from "./fleeBallTurret.js";
import { createFleeExploreIntent } from "./createFleeExploreIntent.js";
import { createBrain } from "../../../AI/brain/createBrain.js";
import { createSpatialBrainSync } from "../../../AI/brain/syncSpatialBrain.js";
import { createCellTargetHpaNav } from "../../../Sandbox/groundNav/cellTargetHpaNav.js";
import { grantSnakeSteeringLease, revokeSnakeSteeringLease } from "../snakeSteeringLease.js";
import { getSnakeGameConfig } from "../snakeGameConfig.js";
import { resolveSnakeExploreCell } from "../snakeExplore.js";
export class FleeAgentInstance {
    constructor({ headId, spawnGroupId }) {
        this.headId = headId;
        this.spawnGroupId = spawnGroupId;
        this.lifecycle = "alive";
    }
    start(state) {
        grantSnakeSteeringLease(this, state);
        const config = getSnakeGameConfig();
        const snakeGame = state.sandbox.snakeGame;
        this.brain = createBrain({ spatialMemoryCapacity: config.spatialMemoryCapacity });
        const brainSync = createSpatialBrainSync(this.brain, { visionCone: config.visionCone, navMemoryStepPenalty: config.navMemoryStepPenalty, navMemoryStepFalloff: config.navMemoryStepFalloff });
        this.headNav = createCellTargetHpaNav(state);
        this.intent = createFleeExploreIntent({
            brain: this.brain,
            sync: (agent, gameState) => brainSync(agent, gameState),
            headNav: this.headNav,
            resolveExploreCell: (seeker, gameState, memory, exploreRng) => resolveSnakeExploreCell(seeker, gameState, memory, exploreRng, snakeGame.navWalkable),
            selfHeadId: this.headId,
            registry: snakeGame.registry,
            navWalkable: snakeGame.navWalkable,
            visionCone: config.visionCone,
        });
        this.intent.resetMode();
    }
    stopSteering(state) {
        revokeSnakeSteeringLease(this, state);
        const head = state.entityRegistry.getLive(this.headId);
        if (this.intent) this.intent.clearIntent(head, state);
        if (this.headNav && head) this.headNav.clear(head);
    }
    tick(state, dtMs) {
        if (this.lifecycle !== "alive" || !this.intent) return;
        tickAgentIntent(state, this.intent, dtMs, (head) => {
            this.intent.tick(head, state);
            syncFleeBallTurretFacing(head, dtMs);
        });
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
export function createFleeAgentInstance(state, { headId, spawnGroupId }) {
    const instance = new FleeAgentInstance({ headId, spawnGroupId });
    instance.syncMembersFromGraph(state);
    return instance;
}
export function getFleeAgentInstance(snakeGame, headId) {
    return snakeGame.instancesByHeadId.get(headId) ?? null;
}
