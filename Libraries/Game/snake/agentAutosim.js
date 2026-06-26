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
/** Shared ground-nav autosim for flee, snake, and squid. */
export function createAgentAutosim(state, instance) {
    const profileId = instance.profileId;
    const agentId = instance.headId;
    const session = state.sandbox.snakeGame;
    const shared = session.config.shared;
    const entityRegistry = state.entityRegistry;
    const kinetic = state.kinetic;
    const agentCtx = { instance, session, navWalkable: session.navWalkable };
    const profile = instance.profile;
    const metabolism = createAgentMetabolism(profile);
    const brain = createBrain({ spatialMemoryCapacity: shared.spatialMemoryCapacity });
    const sync = createSpatialBrainSync(brain, { visionRange: instance.visionRange, navMemoryStepPenalty: shared.navMemoryStepPenalty, navMemoryStepFalloff: shared.navMemoryStepFalloff });
    instance.headNav = createCellTargetHpaNav(state);
    const foodValue = profile.metabolism?.foodValue;
    const resolvedBallType = profile.bodyPropId;
    const resolvedGrowDirX = profile.growDirX ?? -1;
    const resolvedGrowDirY = profile.growDirY ?? 0;
    const baseMaxSpeed = instance.leaderGameplay.maxSpeed;
    const baseAccel = instance.leaderGameplay.accel;
    const sprint = profile.sprint ?? {};
    const resolveChainTailProp = () => {
        for (let i = instance.memberProps.length - 1; i >= 0; i--) {
            const tail = instance.memberProps[i];
            if (tail && !tail.isDead) return tail;
        }
    };
    const intent = createGroundNavIntentAdapter(buildGroundNavIntentAdapterOptions({ state, instance, brain, sync, headNav: instance.headNav, agentCtx }));
    instance.intent = intent;
    instance.brain = brain;
    instance.metabolism = metabolism;
    let active = false;
    const growOneSegment = () => {
        const segmentRadius = getCirclePropRadius(instance.head);
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
    const eatFoodShard = (seeker, food) => {
        if (!canAgentEatSnakeFood(seeker, food) || !isSnakeFoodTarget(food)) return false;
        if (Math.hypot(food.x - seeker.x, food.y - seeker.y) > instance.eatRadius) return false;
        const grid = state.obstacleGrid;
        brain.stampArrival(grid.worldCol(food.x), grid.worldRow(food.y));
        intent.clearTrackedGoal();
        instance.headNav.clearDestination();
        removeSandboxWorldProp(state, food);
        if (profileId === AGENT_PROFILE.snake) feedAndGrow(food.snakeFoodValue ?? foodValue);
        else feedAgentMetabolism(metabolism, food.snakeFoodValue ?? foodValue);
        return true;
    };
    const initialHunger = profile.initialHunger ?? 1;
    const autosim = {
        start() {
            active = true;
            instance.sprinting = false;
            setAgentHunger(metabolism, initialHunger);
            intent.resetMode();
            intent.resetMemory();
        },
        stop() {
            active = false;
            instance.sprinting = false;
            intent.clear(instance.head, state);
        },
        isActive() {
            return active;
        },
        getPathOverlay() {
            return instance.headNav.getPathOverlay(instance.head);
        },
        tick(dtMs, admitted = true) {
            if (!active) return;
            const seeker = instance.head;
            const members = instance.memberIds;
            if (instance.lifecycle !== "alive") return;
            if (!instance.isSteerable()) {
                instance.die(state);
                return;
            }
            if (profile.topology === "chain" && instance.enforceMinLength(state, members)) return;
            const soloTick = !session._batchingPerception;
            if (session._batchingPerception) ensureSnakePerceptionTick(state);
            else maybeBeginSnakeAutosimTick(state);
            let choice;
            if (admitted) choice = intent.tick(seeker, state, dtMs);
            instance.sprinting = intent.getDecisionContext()?.sprintIntent?.want === true && getAgentHunger(metabolism) > 0;
            seeker.strategy.groundNav.maxSpeed = instance.sprinting ? baseMaxSpeed * sprint.speedMultiplier : baseMaxSpeed;
            seeker.strategy.groundNav.accel = instance.sprinting ? baseAccel * sprint.accelMultiplier : baseAccel;
            instance.headNav.tick(seeker, dtMs);
            if (soloTick) endSnakePerceptionFrame(state);
            let fedThisTick = false;
            let foodTarget = null;
            if (choice?.mode === "seek_food" && choice.target && isSnakeFoodTarget(choice.target)) foodTarget = choice.target;
            else if (intent.getMode() === "seek_food" && intent.getTargetId() != null) foodTarget = entityRegistry.getLive(intent.getTargetId());
            if (foodTarget) fedThisTick = eatFoodShard(seeker, foodTarget);
            const drainMultiplier = instance.sprinting ? (sprint.hungerDrainMultiplier ?? 1) : 1;
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
