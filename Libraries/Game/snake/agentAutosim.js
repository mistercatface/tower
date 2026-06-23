import { getConnectedBodyIds } from "../../Motion/kineticConstraintGraph.js";
import { growChainSegment } from "../../Sandbox/spawnLinkedBallChain.js";
import { removeSandboxWorldProp } from "../../Sandbox/sandboxPlacedSpawn.js";
import { createAgentBrain } from "./agentBrain.js";
import { createGroundNavAgentIntent } from "./createGroundNavAgentIntent.js";
import { AGENT_PROFILE, getAgentProfile } from "../../AI/agents/agentProfile.js";
import { createCellTargetHpaNav } from "../../Sandbox/groundNav/cellTargetHpaNav.js";
import { getKineticRollConfig } from "../../Sandbox/kineticRollActuator.js";
import { getSharedConfig, getSnakeGameConfig, resolveSnakeEatRadius } from "./snakeGameConfig.js";
import { applyAgentGameplay } from "./applyAgentGameplay.js";
import { SNAKE_CHAIN_EXPORT_TYPE } from "./snakeScene.js";
import { getSnakeChainRadius, growSnakeChainAfterMeal } from "./snakeScale.js";
import { copySnakeChainTintFromHead } from "./snakeChainColor.js";
import { resolveSnakeExploreCell } from "./snakeExplore.js";
import { canAgentEatSnakeFood, findNearestVisibleSnakeFood, findNearestVisibleSnakeFoodFromVision, isSnakeShardFood } from "./snakeFood.js";
import { createSimpleAgentMetabolism, feedSimpleAgentMetabolism, getSimpleAgentHunger, setSimpleAgentHunger, tickSimpleAgentMetabolism } from "./agentMetabolism.js";
import { createSnakeMetabolism, feedSnakeMetabolism, getSnakeHunger, setSnakeHunger, tickSnakeMetabolism } from "./snakeStarvation.js";
import { enforceSnakeMinLength } from "./snakeCombat.js";
import { getAgentInstance } from "./AgentInstance.js";
import { tickAgentIntent } from "./snakeAgentLifecycle.js";
import { getCirclePropRadius } from "../../Props/propScale.js";
export function runAgentFsmTick(intent, seeker, state, dt, beforeNav, useIntentTick) {
    let choice;
    tickAgentIntent(state, intent, dt, (agent) => {
        if (useIntentTick && typeof intent.tick === "function") choice = intent.tick(agent, state);
        else {
            intent.perceive(agent, state);
            choice = intent.transition(agent, state);
        }
        if (beforeNav) beforeNav(agent);
    });
    return choice;
}
function chainMemberProps(state, leaderId) {
    const ids = getConnectedBodyIds(state.kinetic, leaderId);
    const members = [];
    for (let i = 0; i < ids.length; i++) {
        const member = state.entityRegistry.getLive(ids[i]);
        if (member) members.push(member);
    }
    return members;
}
function resolveLeaderRadius(state, profileId, leaderId) {
    if (profileId === AGENT_PROFILE.snake || profileId === AGENT_PROFILE.squid) return getSnakeChainRadius(state, leaderId);
    const leader = state.entityRegistry.getLive(leaderId);
    return getCirclePropRadius(leader);
}
function resolveMetabolismApi(profileId) {
    if (profileId === AGENT_PROFILE.snake)
        return {
            create: createSnakeMetabolism,
            get: getSnakeHunger,
            set: setSnakeHunger,
            feed: (metabolism, value, ctx) => feedSnakeMetabolism(metabolism, value),
            tick: (metabolism, dtMs, drainMultiplier, ctx) => tickSnakeMetabolism(ctx.state, ctx.leaderId, metabolism, dtMs, ctx.members, drainMultiplier),
        };
    if (profileId === AGENT_PROFILE.flee || profileId === AGENT_PROFILE.squid)
        return {
            create: createSimpleAgentMetabolism,
            get: getSimpleAgentHunger,
            set: setSimpleAgentHunger,
            feed: (metabolism, value) => feedSimpleAgentMetabolism(metabolism, profileId, value),
            tick: (metabolism, dtMs, drainMultiplier) => tickSimpleAgentMetabolism(metabolism, profileId, dtMs, drainMultiplier),
        };
    throw new Error(`createAgentAutosim: metabolism not wired for profile ${profileId}`);
}
function sprintAllowed(profileId, segmentCount, metabolism, config) {
    if (profileId === AGENT_PROFILE.flee) return getSimpleAgentHunger(metabolism) > 0;
    if (profileId === AGENT_PROFILE.squid) return segmentCount >= 2;
    if (profileId === AGENT_PROFILE.snake) return segmentCount > config.minAliveSegmentCount;
    return true;
}
function resolveChainInstance(snakeGame, profileId, leaderId) {
    if (profileId === AGENT_PROFILE.snake || profileId === AGENT_PROFILE.squid) return getAgentInstance(snakeGame, leaderId);
    return null;
}
/** Shared ground-nav autosim for flee, snake, and squid. */
export function createAgentAutosim(
    state,
    { profileId, leaderId, navWalkable, rng = Math.random, visionRange = null, initialFoodFraction = null, eatRadius = null, ballType = null, growDirX = null, growDirY = null },
) {
    const config = getSnakeGameConfig();
    const profile = getAgentProfile(profileId, config);
    const shared = getSharedConfig(config);
    const registry = state.sandbox.snakeGame.registry;
    const metabolismApi = resolveMetabolismApi(profileId);
    const metabolism = metabolismApi.create();
    const { brain, sync } = createAgentBrain(visionRange);
    const headNav = createCellTargetHpaNav(state);
    const resolvedVisionRange = visionRange ?? shared.visionRange;
    const terminalHoming = shared.terminalHoming;
    const useIntentTick = profile.intent?.returnShape === "intentTick";
    const foodValue = profile.metabolism?.foodValue ?? config.metabolism?.foodValue;
    const huntMode = profile.intent?.huntMode ?? "seek_prey";
    const resolvedBallType = ballType ?? config.bodyPropId ?? profile.bodyPropId;
    const resolvedGrowDirX = growDirX ?? config.growDirX ?? profile.growDirX ?? -1;
    const resolvedGrowDirY = growDirY ?? config.growDirY ?? profile.growDirY ?? 0;
    const resolveEatRadiusValue = (seeker) => {
        if (typeof eatRadius === "function") return eatRadius();
        if (eatRadius != null) return eatRadius;
        return resolveSnakeEatRadius(config, resolveLeaderRadius(state, profileId, leaderId));
    };
    const resolveVisibleFood = (seeker, gameState, visionContext = null) =>
        visionContext
            ? findNearestVisibleSnakeFoodFromVision(gameState, seeker, visionContext.frame, visionContext.vision, visionContext.visionRange)
            : findNearestVisibleSnakeFood(gameState, seeker, resolvedVisionRange);
    const resolveSeeker = () => state.entityRegistry.getLive(leaderId);
    const resolveChainTailProp = () => {
        const members = chainMemberProps(state, leaderId);
        const tail = members[members.length - 1];
        if (!tail) throw new Error(`Cannot grow chain ${leaderId}: no live tail segment`);
        return tail;
    };
    const intent = createGroundNavAgentIntent({
        profileId,
        brain,
        sync,
        headNav,
        resolveVisibleFood,
        resolveExploreCell: (seeker, gameState, memory, exploreRng) => resolveSnakeExploreCell(seeker, gameState, memory, exploreRng, navWalkable),
        selfHeadId: leaderId,
        registry,
        navWalkable,
        visionRange: resolvedVisionRange,
        seekArrivalRadius: (mode, agent, target) => {
            if (mode === "seek_ally") {
                const cohesion = profile.factionCohesion ?? {};
                return { arrivalRadius: cohesion.arrivalRadius ?? (profileId === AGENT_PROFILE.snake ? 32 : 24), lockOnTarget: true, terminalHoming };
            }
            const huntArrival = Math.max(2, resolveLeaderRadius(state, profileId, leaderId) * 0.25);
            if (mode === huntMode || mode === "seek_prey" || mode === "seek_enemy") return { arrivalRadius: huntArrival, lockOnTarget: true, terminalHoming };
            if (!isSnakeShardFood(target)) return { arrivalRadius: huntArrival, lockOnTarget: true, terminalHoming };
            return { arrivalRadius: resolveEatRadiusValue(agent), lockOnTarget: true, terminalHoming };
        },
        resolveHunger: () => metabolismApi.get(metabolism),
        resolveSegmentCount: () => getConnectedBodyIds(state.kinetic, leaderId).length,
        rng,
    });
    let active = false;
    let sprinting = false;
    let baseMaxSpeed = null;
    let baseAccel = null;
    const applySprintState = (seeker) => {
        if (baseMaxSpeed === null) {
            const baseRoll = getKineticRollConfig(seeker);
            baseMaxSpeed = baseRoll.maxSpeed;
            baseAccel = baseRoll.accel;
        }
        const segmentCount = getConnectedBodyIds(state.kinetic, leaderId).length;
        const want = intent.getDecisionContext()?.sprintIntent?.want === true;
        sprinting = want && sprintAllowed(profileId, segmentCount, metabolism, config);
        const nav = seeker.strategy.groundNav ?? (seeker.strategy.groundNav = {});
        const sprint = profile.sprint ?? {};
        nav.maxSpeed = sprinting ? baseMaxSpeed * sprint.speedMultiplier : baseMaxSpeed;
        nav.accel = sprinting ? baseAccel * sprint.accelMultiplier : baseAccel;
    };
    const growOneSegment = () => {
        const grow = growSnakeChainAfterMeal(state, leaderId);
        const tail = resolveChainTailProp();
        const newTail = growChainSegment(state, tail, {
            spacing: grow.spacing,
            segmentRadius: grow.segmentRadius,
            linkSlack: grow.linkSlack,
            ballType: resolvedBallType,
            growDirX: resolvedGrowDirX,
            growDirY: resolvedGrowDirY,
            exportType: SNAKE_CHAIN_EXPORT_TYPE,
        });
        copySnakeChainTintFromHead(state, leaderId, newTail);
        applyAgentGameplay(AGENT_PROFILE.snake, newTail, "body");
    };
    const feedAndGrow = (value, members) => {
        let pending = feedSnakeMetabolism(metabolism, value);
        while (pending > 0 && chainMemberProps(state, leaderId).length < config.maxAliveSegmentCount) {
            growOneSegment();
            pending--;
        }
    };
    const eatFoodShard = (seeker, food, members = null) => {
        if (!canAgentEatSnakeFood(seeker, food) || !isSnakeShardFood(food)) return false;
        if (Math.hypot(food.x - seeker.x, food.y - seeker.y) > resolveEatRadiusValue(seeker)) return false;
        const grid = state.obstacleGrid;
        brain.stampArrival(grid.worldCol(food.x), grid.worldRow(food.y));
        intent.clearTrackedGoal();
        intent.headNav.clearDestination();
        removeSandboxWorldProp(state, food);
        if (profileId === AGENT_PROFILE.snake) feedAndGrow(food.snakeFoodValue ?? foodValue, members);
        else metabolismApi.feed(metabolism, food.snakeFoodValue ?? foodValue);
        return true;
    };
    const initialHunger = initialFoodFraction ?? profile.initialHunger ?? 1;
    const autosim = {
        headId: leaderId,
        metabolism,
        getIntent() {
            return intent;
        },
        getBrain() {
            return brain;
        },
        getHeadNav() {
            return headNav;
        },
        start() {
            active = true;
            metabolismApi.set(metabolism, initialHunger);
            intent.resetMode();
            if (intent.resetMemory) intent.resetMemory();
            runAgentFsmTick(intent, resolveSeeker(), state, 0, applySprintState, useIntentTick);
        },
        stop() {
            active = false;
            const seeker = resolveSeeker();
            if (typeof intent.clearIntent === "function") intent.clearIntent(seeker, state);
            else {
                intent.headNav.clear(seeker);
                intent.clear(seeker, state);
            }
        },
        isActive() {
            return active;
        },
        isSprinting() {
            return sprinting;
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
            return intent.getFsmSnapshot?.(seeker, state) ?? null;
        },
        getFoodTimerFraction() {
            return metabolismApi.get(metabolism);
        },
        getPathOverlay() {
            return intent.headNav.getPathOverlay(resolveSeeker());
        },
        tick(dtMs) {
            if (!active) return;
            const snakeGame = state.sandbox.snakeGame;
            const seeker = resolveSeeker();
            const members = getConnectedBodyIds(state.kinetic, leaderId);
            const instance = resolveChainInstance(snakeGame, profileId, leaderId);
            if (instance) {
                if (instance.lifecycle !== "alive") return;
                if (!seeker || !instance.isSteerable(state, snakeGame.registry)) {
                    if (profileId === AGENT_PROFILE.snake) instance.die(state, snakeGame, members);
                    return;
                }
            } else if (!seeker) return;
            if (profileId === AGENT_PROFILE.snake && enforceSnakeMinLength(state, snakeGame, leaderId, members)) return;
            if (intent.getMode() === "seek_food" && intent.getTargetId() != null) {
                const food = state.entityRegistry.getLive(intent.getTargetId());
                if (food && eatFoodShard(seeker, food, members)) return;
            }
            const choice = runAgentFsmTick(intent, seeker, state, dtMs, applySprintState, useIntentTick);
            let fedThisTick = false;
            if (choice?.mode === "seek_food" && choice.target && isSnakeShardFood(choice.target)) fedThisTick = eatFoodShard(seeker, choice.target, members);
            const drainMultiplier = sprinting ? (profile.sprint?.hungerDrainMultiplier ?? 1) : 1;
            if (!fedThisTick) metabolismApi.tick(metabolism, dtMs, drainMultiplier, { state, leaderId, members });
        },
    };
    return autosim;
}
