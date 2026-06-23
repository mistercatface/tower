import { getConnectedBodyIds } from "../../../Motion/kineticConstraintGraph.js";
import { removeSandboxWorldProp } from "../../../Sandbox/sandboxPlacedSpawn.js";
import { createGroundNavAgentIntent } from "../createGroundNavAgentIntent.js";
import { AGENT_PROFILE, getAgentProfile } from "../../../AI/agents/agentProfile.js";
import { createCellTargetHpaNav } from "../../../Sandbox/groundNav/cellTargetHpaNav.js";
import { getKineticRollConfig } from "../../../Sandbox/kineticRollActuator.js";
import { getSharedConfig, getSnakeGameConfig, resolveSnakeEatRadius } from "../snakeGameConfig.js";
import { resolveSnakeExploreCell } from "../snakeExplore.js";
import { canAgentEatSnakeFood, findNearestVisibleSnakeFood, findNearestVisibleSnakeFoodFromVision, isSnakeShardFood } from "../snakeFood.js";
import { getSquidChainRadius } from "./squidScale.js";
import { createSquidMetabolism, feedSquidMetabolism, getSquidHunger, setSquidHunger, tickSquidMetabolism } from "./squidMetabolism.js";
import { getSquidInstance } from "./SquidInstance.js";
import { tickAgentIntent } from "../snakeAgentLifecycle.js";
import { createSnakeBrain } from "../snakeAutosim.js";

function runSquidFsmTick(intent, seeker, state, dt, beforeNav = null) {
    let choice;
    tickAgentIntent(state, intent, dt, (agent) => {
        intent.perceive(agent, state);
        choice = intent.transition(agent, state);
        if (beforeNav) beforeNav(agent);
    });
    return choice;
}

export function createSquidAutosim(state, { brainId, navWalkable, eatRadius, rng = Math.random, visionRange = null, initialFoodFraction = 1 }) {
    const config = getSnakeGameConfig();
    const shared = getSharedConfig(config);
    const resolvedEatRadius = eatRadius ?? (() => resolveSnakeEatRadius(config, getSquidChainRadius(state, brainId)));
    const resolveHuntArrivalRadius = () => Math.max(2, getSquidChainRadius(state, brainId) * 0.25);
    const registry = state.sandbox.snakeGame.registry;
    const { brain, sync } = createSnakeBrain(visionRange);
    const headNav = createCellTargetHpaNav(state);
    const resolvedVisionRange = visionRange ?? shared.visionRange;
    const metabolism = createSquidMetabolism();
    const resolveVisibleFood = (seeker, gameState, visionContext = null) => {
        return visionContext
            ? findNearestVisibleSnakeFoodFromVision(gameState, seeker, visionContext.frame, visionContext.vision, visionContext.visionRange)
            : findNearestVisibleSnakeFood(gameState, seeker, resolvedVisionRange);
    };
    const intent = createGroundNavAgentIntent({
        profileId: AGENT_PROFILE.squid,
        brain,
        sync,
        headNav,
        resolveVisibleFood,
        resolveExploreCell: (seeker, gameState, memory, exploreRng) => resolveSnakeExploreCell(seeker, gameState, memory, exploreRng, navWalkable),
        selfHeadId: brainId,
        registry,
        navWalkable,
        visionRange: resolvedVisionRange,
        seekArrivalRadius: (mode, agent, target) => {
            const terminalHoming = shared.terminalHoming;
            if (mode === "seek_prey") return { arrivalRadius: resolveHuntArrivalRadius(), lockOnTarget: true, terminalHoming };
            if (!isSnakeShardFood(target)) return { arrivalRadius: resolveHuntArrivalRadius(), lockOnTarget: true, terminalHoming };
            return { arrivalRadius: typeof resolvedEatRadius === "function" ? resolvedEatRadius() : resolvedEatRadius, lockOnTarget: true, terminalHoming };
        },
        resolveHunger: () => getSquidHunger(metabolism),
        resolveSegmentCount: () => getConnectedBodyIds(state.kinetic, brainId).length,
        rng,
    });
    let active = false;
    let sprinting = false;
    let baseMaxSpeed = null;
    let baseAccel = null;
    const applySprintState = (seeker, segmentCount) => {
        if (baseMaxSpeed === null) {
            const baseRoll = getKineticRollConfig(seeker);
            baseMaxSpeed = baseRoll.maxSpeed;
            baseAccel = baseRoll.accel;
        }
        const want = intent.getDecisionContext()?.sprintIntent?.want === true;
        sprinting = want && segmentCount >= 2;
        const nav = seeker.strategy.groundNav ?? (seeker.strategy.groundNav = {});
        const sprint = getAgentProfile(AGENT_PROFILE.squid).sprint;
        nav.maxSpeed = sprinting ? baseMaxSpeed * sprint.speedMultiplier : baseMaxSpeed;
        nav.accel = sprinting ? baseAccel * sprint.accelMultiplier : baseAccel;
    };
    const resolveSeeker = () => state.entityRegistry.getLive(brainId);
    const eatFoodShard = (seeker, food) => {
        if (!canAgentEatSnakeFood(seeker, food)) return;
        const grid = state.obstacleGrid;
        brain.stampArrival(grid.worldCol(food.x), grid.worldRow(food.y));
        intent.clearTrackedGoal();
        intent.headNav.clearDestination();
        removeSandboxWorldProp(state, food);
        feedSquidMetabolism(metabolism, food.snakeFoodValue ?? getAgentProfile(AGENT_PROFILE.squid).metabolism.foodValue);
    };
    return {
        headId: brainId,
        start() {
            active = true;
            setSquidHunger(metabolism, initialFoodFraction);
            intent.resetMode();
            intent.resetMemory();
            runSquidFsmTick(intent, resolveSeeker(), state, 0);
        },
        stop() {
            active = false;
            const seeker = resolveSeeker();
            intent.headNav.clear(seeker);
            intent.clear(seeker, state);
        },
        isActive() {
            return active;
        },
        getMode() {
            return intent.getMode();
        },
        getTargetId() {
            return intent.getTargetId();
        },
        getDestination() {
            return intent.getDestination();
        },
        getLastTransitionReason() {
            return intent.getLastTransitionReason();
        },
        getFsmSnapshot() {
            const seeker = resolveSeeker();
            return intent.getFsmSnapshot(seeker, state);
        },
        getBrain() {
            return brain;
        },
        getFoodTimerFraction() {
            return getSquidHunger(metabolism);
        },
        isSprinting() {
            return sprinting;
        },
        getPathOverlay() {
            return intent.headNav.getPathOverlay(resolveSeeker());
        },
        tick(dtMs) {
            if (!active) return;
            const snakeGame = state.sandbox.snakeGame;
            const seeker = resolveSeeker();
            const members = getConnectedBodyIds(state.kinetic, brainId);
            const instance = getSquidInstance(snakeGame, brainId);
            if (!instance || instance.lifecycle !== "alive") return;
            if (!seeker || !instance.isSteerable(state, snakeGame.registry)) return;
            if (intent.getMode() === "seek_food" && intent.getTargetId() != null) {
                const food = state.entityRegistry.getLive(intent.getTargetId());
                if (food && !food.isDead && isSnakeShardFood(food)) {
                    const dist = Math.hypot(food.x - seeker.x, food.y - seeker.y);
                    const radius = typeof resolvedEatRadius === "function" ? resolvedEatRadius() : resolvedEatRadius;
                    if (dist <= radius) {
                        eatFoodShard(seeker, food);
                        return;
                    }
                }
            }
            const choice = runSquidFsmTick(intent, seeker, state, dtMs, (s) => applySprintState(s, members.length));
            let fedThisTick = false;
            if (choice.mode === "seek_food" && choice.target) {
                const food = choice.target;
                if (isSnakeShardFood(food)) {
                    const dist = Math.hypot(food.x - seeker.x, food.y - seeker.y);
                    const radius = typeof resolvedEatRadius === "function" ? resolvedEatRadius() : resolvedEatRadius;
                    if (dist <= radius) {
                        eatFoodShard(seeker, food);
                        fedThisTick = true;
                    }
                }
            }
            const drainMultiplier = sprinting ? getAgentProfile(AGENT_PROFILE.squid).sprint.hungerDrainMultiplier : 1;
            if (!fedThisTick) tickSquidMetabolism(metabolism, dtMs, drainMultiplier);
        },
    };
}
