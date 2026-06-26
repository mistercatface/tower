import { getConnectedBodyIds } from "../../Motion/kineticConstraintGraph.js";
import { createBrain } from "../../AI/brain/createBrain.js";
import { createSpatialBrainSync } from "../../AI/brain/syncSpatialBrain.js";
import { growChainSegment } from "../../Sandbox/spawnLinkedBallChain.js";
import { removeSandboxWorldProp } from "../../Sandbox/sandboxPlacedSpawn.js";
import { createGroundNavIntentAdapter } from "./createGroundNavIntentAdapter.js";
import { buildGroundNavIntentAdapterOptions } from "./createGroundNavIntentAdapter.js";
import { AGENT_PROFILE } from "../../AI/agents/agentProfile.js";
import { createCellTargetHpaNav } from "../../Sandbox/groundNav/cellTargetHpaNav.js";
import { applyAgentGameplay } from "./applyAgentGameplay.js";
import { SNAKE_CHAIN_EXPORT_TYPE } from "./snakeScene.js";
import { copySnakeChainTintFromHead } from "./snakeChainColor.js";
import { canAgentEatSnakeFood, isSnakeFoodTarget } from "./snakeFood.js";
import { createAgentMetabolism, getAgentHunger, setAgentHunger, feedAgentMetabolism, tickAgentMetabolism, shrinkSnakeChainFromStarvation } from "./agentMetabolism.js";
import { ensureSnakePerceptionTick, maybeBeginSnakeAutosimTick, endSnakePerceptionFrame } from "./snakePerception.js";
import { getCirclePropRadius } from "../../Props/propScale.js";
function resolveAgentRadius(leader) {
    return getCirclePropRadius(leader);
}
function sprintAllowed(profileId, segmentCount, metabolism, profile) {
    if (profileId === AGENT_PROFILE.flee) return getAgentHunger(metabolism) > 0;
    if (profileId === AGENT_PROFILE.squid) return segmentCount >= 2;
    if (profileId === AGENT_PROFILE.snake) return segmentCount > (profile.minAliveSegmentCount ?? 3);
    return true;
}
/** Shared ground-nav autosim for flee, snake, and squid. */
export function createAgentAutosim(state, instance, { rng = Math.random, initialFoodFraction = null, eatRadius = null, ballType = null, growDirX = null, growDirY = null } = {}) {
    const profileId = instance.profileId;
    const agentId = instance.headId;
    const session = state.sandbox.snakeGame;
    const shared = session.config.shared;
    const agentCtx = { instance, session, navWalkable: session.navWalkable };
    const profile = instance.profile;
    const metabolism = createAgentMetabolism(profile);
    const brain = createBrain({ spatialMemoryCapacity: shared.spatialMemoryCapacity });
    const sync = createSpatialBrainSync(brain, { visionRange: instance.visionRange, navMemoryStepPenalty: shared.navMemoryStepPenalty, navMemoryStepFalloff: shared.navMemoryStepFalloff });
    const headNav = createCellTargetHpaNav(state);
    const foodValue = profile.metabolism?.foodValue;
    const snakeProfile = profileId === AGENT_PROFILE.snake ? profile : null;
    const resolvedBallType = ballType ?? profile.bodyPropId ?? snakeProfile?.bodyPropId;
    const resolvedGrowDirX = growDirX ?? profile.growDirX ?? -1;
    const resolvedGrowDirY = growDirY ?? profile.growDirY ?? 0;
    const baseMaxSpeed = instance.leaderGameplay.maxSpeed;
    const baseAccel = instance.leaderGameplay.accel;
    const sprint = profile.sprint ?? {};
    const resolveEatRadiusValue = (seeker) => {
        if (typeof eatRadius === "function") return eatRadius();
        if (eatRadius != null) return eatRadius;
        return instance.eatRadius;
    };
    const resolveSeeker = () => instance.head;
    const resolveChainTailProp = () => {
        for (let i = instance.memberProps.length - 1; i >= 0; i--) {
            const tail = instance.memberProps[i];
            if (tail && !tail.isDead) return tail;
        }
        throw new Error(`Cannot grow chain ${agentId}: no live tail segment`);
    };
    const intent = createGroundNavIntentAdapter(
        buildGroundNavIntentAdapterOptions({ state, instance, resolveHunger: () => getAgentHunger(metabolism), eatRadius, brain, sync, headNav, agentCtx, rng }),
    );
    let active = false;
    let sprinting = false;
    const growOneSegment = () => {
        const segmentRadius = resolveAgentRadius(instance.head);
        const grow = { segmentRadius, spacing: segmentRadius * 2 * (profile.linkSlack ?? 1), linkSlack: profile.linkSlack };
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
        copySnakeChainTintFromHead(instance.head, newTail);
        applyAgentGameplay(instance.bodyGameplay, newTail);
        instance.memberIds.push(newTail.id);
        instance.memberProps.push(newTail);
    };
    const feedAndGrow = (value) => {
        let pending = feedAgentMetabolism(metabolism, value);
        const maxAliveSegmentCount = profile.maxAliveSegmentCount ?? 8;
        while (pending > 0 && instance.memberProps.length < maxAliveSegmentCount) {
            growOneSegment();
            pending--;
        }
    };
    const eatFoodShard = (seeker, food, members = null) => {
        if (!canAgentEatSnakeFood(seeker, food) || !isSnakeFoodTarget(food)) return false;
        if (Math.hypot(food.x - seeker.x, food.y - seeker.y) > resolveEatRadiusValue(seeker)) return false;
        const grid = state.obstacleGrid;
        brain.stampArrival(grid.worldCol(food.x), grid.worldRow(food.y));
        intent.clearTrackedGoal();
        intent.headNav.clearDestination();
        removeSandboxWorldProp(state, food);
        if (profileId === AGENT_PROFILE.snake) feedAndGrow(food.snakeFoodValue ?? foodValue, members);
        else feedAgentMetabolism(metabolism, food.snakeFoodValue ?? foodValue);
        return true;
    };
    const initialHunger = initialFoodFraction ?? profile.initialHunger ?? 1;
    const autosim = {
        headId: agentId,
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
            setAgentHunger(metabolism, initialHunger);
            intent.resetMode();
            if (intent.resetMemory) intent.resetMemory();
            const snakeGame = state.sandbox.snakeGame;
            const seeker = resolveSeeker();
            const members = getConnectedBodyIds(state.kinetic, agentId);
            const soloTick = !snakeGame._batchingPerception;
            if (snakeGame._batchingPerception) ensureSnakePerceptionTick(state);
            else maybeBeginSnakeAutosimTick(state);
            intent.tick(seeker, state, 0);
            sprinting = intent.getDecisionContext()?.sprintIntent?.want === true && sprintAllowed(profileId, members.length, metabolism, profile);
            seeker.strategy.groundNav.maxSpeed = sprinting ? baseMaxSpeed * sprint.speedMultiplier : baseMaxSpeed;
            seeker.strategy.groundNav.accel = sprinting ? baseAccel * sprint.accelMultiplier : baseAccel;
            intent.headNav.tick(seeker, 0);
            if (soloTick) endSnakePerceptionFrame(state);
        },
        stop() {
            active = false;
            const seeker = resolveSeeker();
            intent.clear(seeker, state);
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
            return getAgentHunger(metabolism);
        },
        getPathOverlay() {
            return intent.headNav.getPathOverlay(resolveSeeker());
        },
        tick(dtMs, admitted = true) {
            if (!active) return;
            const snakeGame = state.sandbox.snakeGame;
            const seeker = resolveSeeker();
            const members = getConnectedBodyIds(state.kinetic, agentId);
            if (profileId === AGENT_PROFILE.snake || profileId === AGENT_PROFILE.squid) {
                if (instance.lifecycle !== "alive") return;
                if (!instance.isSteerable(state, snakeGame.registry)) {
                    if (profileId === AGENT_PROFILE.snake) instance.die(state, members);
                    return;
                }
            }
            if (profileId === AGENT_PROFILE.snake && instance.enforceMinLength(state, members)) return;
            if (intent.getMode() === "seek_food" && intent.getTargetId() != null) {
                const food = state.entityRegistry.getLive(intent.getTargetId());
                if (food && eatFoodShard(seeker, food, members)) return;
            }
            const soloTick = !snakeGame._batchingPerception;
            if (snakeGame._batchingPerception) ensureSnakePerceptionTick(state);
            else maybeBeginSnakeAutosimTick(state);
            let choice;
            if (admitted) {
                choice = intent.tick(seeker, state, dtMs);
                sprinting = intent.getDecisionContext()?.sprintIntent?.want === true && sprintAllowed(profileId, members.length, metabolism, profile);
                seeker.strategy.groundNav.maxSpeed = sprinting ? baseMaxSpeed * sprint.speedMultiplier : baseMaxSpeed;
                seeker.strategy.groundNav.accel = sprinting ? baseAccel * sprint.accelMultiplier : baseAccel;
            }
            intent.headNav.tick(seeker, dtMs);
            if (soloTick) endSnakePerceptionFrame(state);
            let fedThisTick = false;
            if (choice?.mode === "seek_food" && choice.target && isSnakeFoodTarget(choice.target)) fedThisTick = eatFoodShard(seeker, choice.target, members);
            const drainMultiplier = sprinting ? (sprint.hungerDrainMultiplier ?? 1) : 1;
            if (!fedThisTick)
                tickAgentMetabolism(metabolism, dtMs, drainMultiplier, () => {
                    const minSegments = metabolism.minAliveSegmentCount ?? 3;
                    if (members.length <= minSegments) return false;
                    const didShrink = shrinkSnakeChainFromStarvation(state, agentId, minSegments, members);
                    if (!didShrink) return false;
                    members.pop();
                    return true;
                });
        },
    };
    return autosim;
}
