import { getConnectedComponentPath } from "../../../Motion/kineticConstraintGraph.js";
import { tickAgentIntent, reapAgentInstance } from "../snakeAgentLifecycle.js";
import { createFleeExploreIntent } from "./createFleeExploreIntent.js";
import { createBrain } from "../../../AI/brain/createBrain.js";
import { createSpatialBrainSync } from "../../../AI/brain/syncSpatialBrain.js";
import { createCellTargetHpaNav } from "../../../Sandbox/groundNav/cellTargetHpaNav.js";
import { grantSnakeSteeringLease, revokeSnakeSteeringLease } from "../snakeSteeringLease.js";
import { getSnakeGameConfig } from "../snakeGameConfig.js";
import { resolveSnakeExploreCell } from "../snakeExplore.js";
import { getKineticRollConfig } from "../../../Sandbox/kineticRollActuator.js";
import { getAgentIdentity } from "../../../AI/identity/agentIdentity.js";
import { createFleeMetabolism, setFleeHunger, tickFleeMetabolism, getFleeHunger } from "./fleeMetabolism.js";
import { tryEatFleeAgentFood } from "./eatFleeAgentFood.js";
import { syncFleeAgentPresentation } from "./syncFleeAgentPresentation.js";
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
        this.metabolism = createFleeMetabolism();
        setFleeHunger(this.metabolism, config.fleeAgent.initialHunger ?? 1);
        this.sprinting = false;
        this.baseMaxSpeed = null;
        this.baseAccel = null;
        this.baseTint = getAgentIdentity(this.headId)?.color ?? null;
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
        const head = state.entityRegistry.getLive(this.headId);
        if (head) syncFleeAgentPresentation(head, { sprinting: false, baseTint: this.baseTint, sprintTint: config.fleeAgent.sprint.tint });
    }
    stopSteering(state) {
        revokeSnakeSteeringLease(this, state);
        const head = state.entityRegistry.getLive(this.headId);
        if (this.intent) this.intent.clearIntent(head, state);
        if (this.headNav && head) this.headNav.clear(head);
    }
    applySprintState(head) {
        const config = getSnakeGameConfig();
        if (this.baseMaxSpeed === null) {
            const baseRoll = getKineticRollConfig(head);
            this.baseMaxSpeed = baseRoll.maxSpeed;
            this.baseAccel = baseRoll.accel;
        }
        const want = this.intent.getDecisionSnapshot()?.sprintIntent?.want === true;
        this.sprinting = want && getFleeHunger(this.metabolism) > 0;
        const nav = head.strategy.groundNav ?? (head.strategy.groundNav = {});
        const sprint = config.fleeAgent.sprint;
        nav.maxSpeed = this.sprinting ? this.baseMaxSpeed * sprint.speedMultiplier : this.baseMaxSpeed;
        nav.accel = this.sprinting ? this.baseAccel * sprint.accelMultiplier : this.baseAccel;
    }
    syncPresentation(head) {
        const config = getSnakeGameConfig();
        syncFleeAgentPresentation(head, { sprinting: this.sprinting, baseTint: this.baseTint, sprintTint: config.fleeAgent.sprint.tint });
    }
    tick(state, dtMs) {
        if (this.lifecycle !== "alive" || !this.intent) return;
        const head = state.entityRegistry.getLive(this.headId);
        if (!head) return;
        const config = getSnakeGameConfig();
        const fedThisTick = tryEatFleeAgentFood(state, head, this.metabolism, this.brain);
        tickAgentIntent(state, this.intent, dtMs, (agent) => {
            this.intent.tick(agent, state);
            this.applySprintState(agent);
            this.syncPresentation(agent);
        });
        const drainMultiplier = this.sprinting ? config.fleeAgent.sprint.hungerDrainMultiplier : 1;
        if (!fedThisTick) tickFleeMetabolism(this.metabolism, dtMs, drainMultiplier);
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
