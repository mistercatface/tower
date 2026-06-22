import { getConnectedComponentPath } from "../../../Motion/kineticConstraintGraph.js";
import { registerAliveAgent, markAgentDead } from "../agentPopulationRegistry.js";
import { syncFleeAgentWedgeFacing } from "./syncFleeAgentWedgeFacing.js";
import { createBrain } from "../../../AI/brain/createBrain.js";
import { createSpatialBrainSync } from "../../../AI/brain/syncSpatialBrain.js";
import { createCellTargetHpaNav, createCellTargetLocomotion } from "../../../Sandbox/groundNav/cellTargetHpaNav.js";
import { grantSnakeSteeringLease, revokeSnakeSteeringLease } from "../snakeSteeringLease.js";
import { getSnakeGameConfig } from "../snakeGameConfig.js";
import { perceiveSnakeIntentWorld, pickFleeCell } from "../snakeIntent.js";
import { resolveSnakeExploreCell } from "../snakeExplore.js";
import { ensureSnakePerceptionTick, maybeBeginSnakeAutosimTick, endSnakePerceptionFrame } from "../snakePerception.js";
export class FleeAgentInstance {
    constructor({ headId, wedgeId, spawnGroupId }) {
        this.headId = headId;
        this.wedgeId = wedgeId;
        this.spawnGroupId = spawnGroupId;
        this.lifecycle = "alive";
    }
    start(state) {
        grantSnakeSteeringLease(this, state);
        const config = getSnakeGameConfig();
        this.brain = createBrain({ spatialMemoryCapacity: config.spatialMemoryCapacity });
        this.brainSync = createSpatialBrainSync(this.brain, { visionCone: config.visionCone, navMemoryStepPenalty: config.navMemoryStepPenalty, navMemoryStepFalloff: config.navMemoryStepFalloff });
        this.headNav = createCellTargetHpaNav(state);
        this.locomotion = createCellTargetLocomotion(this.headNav);
        this.mode = "explore";
        this.fleeTicks = 0;
        this.lastArrivalCol = null;
        this.lastArrivalRow = null;
    }
    stopSteering(state) {
        revokeSnakeSteeringLease(this, state);
        if (this.headNav) {
            const head = state.entityRegistry.getLive(this.headId);
            if (head) this.headNav.clear(head);
        }
    }
    tick(state, dtMs) {
        if (this.lifecycle !== "alive") return;
        const head = state.entityRegistry.getLive(this.headId);
        if (!head) return;
        const config = getSnakeGameConfig();
        const grid = state.obstacleGrid;
        const snakeGame = state.sandbox.snakeGame;
        const navWalkable = snakeGame.navWalkable;
        const soloTick = !snakeGame._batchingPerception;
        if (snakeGame._batchingPerception) ensureSnakePerceptionTick(state);
        else maybeBeginSnakeAutosimTick(state);
        // 1. Sync brain with vision
        this.brainSync(head, state);
        // Stamp arrival on cell enter
        const currentCell = grid.worldToGrid(head.x, head.y);
        if (currentCell.col !== this.lastArrivalCol || currentCell.row !== this.lastArrivalRow) {
            this.lastArrivalCol = currentCell.col;
            this.lastArrivalRow = currentCell.row;
            this.brain.stampArrival(currentCell.col, currentCell.row);
        }
        // 2. Perceive threats (snakes)
        const perception = perceiveSnakeIntentWorld(head, this.headId, state, snakeGame.registry, () => null, config.visionCone);
        const threat = perception.threat;
        // 3. FSM State Transitions
        if (threat) {
            this.mode = "flee";
            this.fleeTicks = config.fleeHysteresis?.minTicks ?? 45;
        } else if (this.mode === "flee") {
            this.fleeTicks--;
            if (this.fleeTicks <= 0) this.mode = "explore";
        }
        // 4. Execute FSM Actions
        const dest = this.locomotion.getDestination();
        const destReached = dest && (this.locomotion.hasArrivedAtDest(head, grid) || this.locomotion.hasReachedDest(head, grid));
        const routeFailed = dest && this.locomotion.needsRetry(head, state);
        if (this.mode === "flee") {
            const needsNewFleeCell = !dest || destReached || routeFailed || threat;
            if (needsNewFleeCell && threat) {
                const fleeCell = pickFleeCell(head, threat, grid, navWalkable, config.fleeTiles);
                if (fleeCell) this.locomotion.setFlee(head, state, fleeCell);
                else {
                    const exploreCell = resolveSnakeExploreCell(head, state, this.brain.spatial, Math.random, navWalkable);
                    if (exploreCell) this.locomotion.setExplore(head, state, exploreCell);
                }
            }
        } else {
            const needsNewExploreCell = !dest || destReached || routeFailed;
            if (needsNewExploreCell) {
                const exploreCell = resolveSnakeExploreCell(head, state, this.brain.spatial, Math.random, navWalkable);
                if (exploreCell) this.locomotion.setExplore(head, state, exploreCell);
            }
        }
        // 5. Tick locomotion
        this.headNav.tick(head, dtMs);
        if (soloTick) endSnakePerceptionFrame(state);
    }
    syncMembersFromGraph(state) {
        const members = getConnectedComponentPath(state.kinetic, this.headId);
        this.wedgeId = members[1] ?? this.wedgeId;
        return members;
    }
    syncWedgeFacing(state) {
        if (this.lifecycle !== "alive") return false;
        const wedge = state.entityRegistry.getLive(this.headId);
        if (!wedge || wedge.isDead) return false;
        return syncFleeAgentWedgeFacing(wedge, wedge);
    }
    validate(state, snakeGame) {
        if (this.lifecycle !== "alive") return;
        const head = state.entityRegistry.getLive(this.headId);
        if (!head || head.isDead) this.die(state, snakeGame);
    }
    die(state, snakeGame) {
        this.lifecycle = "dead";
        this.stopSteering(state);
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
