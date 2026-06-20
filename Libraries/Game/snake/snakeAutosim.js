import { getConnectedBodyIds } from "../../Motion/kineticConstraintGraph.js";
import { linkedChainOccupiedCellKeys, growChainSegment } from "../../Sandbox/spawnLinkedBallChain.js";
import { removeSandboxWorldProp } from "../../Sandbox/sandboxPlacedSpawn.js";
import { createBrain } from "../../AI/brain/createBrain.js";
import { createSpatialBrainSync } from "../../AI/brain/syncSpatialBrain.js";
import { createSnakeForageIntent } from "../../AI/agentIntent/createSnakeForageIntent.js";
import { formatSnakeFsmDebug } from "./snakeFsmDebugOverlays.js";
import { createCellTargetHpaNav } from "../../Sandbox/groundNav/cellTargetHpaNav.js";
import { getSnakeGameConfig, resolveSnakeEatRadius, applySnakeSegmentGameplay } from "./snakeGameConfig.js";
import { SNAKE_CHAIN_EXPORT_TYPE, spawnGoalOrbOnOpenCell } from "./snakeScene.js";
import { getSnakeChainRadius, growSnakeChainAfterMeal } from "./snakeScale.js";
import { copySnakeChainTintFromHead } from "./snakeChainColor.js";
import { countLiveSnakeGoals, findNearestVisibleSnakeGoal, findNearestVisibleSnakeGoalFromVision, removeSnakeGoalProp } from "./snakeGoals.js";
import { resolveSnakeExploreCell } from "./snakeExplore.js";
import { createSnakeFoodTimer, getSnakeFoodTimerFraction, resetSnakeFoodTimer, tickSnakeFoodTimer } from "./snakeStarvation.js";
import { ensureSnakePerceptionTick, maybeBeginSnakeAutosimTick } from "./snakePerception.js";
export { findSnakeGoalProp, collectSnakeGoalProps, countLiveSnakeGoals, findNearestSnakeGoal, findNearestVisibleSnakeGoal } from "./snakeGoals.js";
export function createSnakeBrain(visionConeOverride) {
    const config = getSnakeGameConfig();
    const brain = createBrain({ spatialMemoryCapacity: config.spatialMemoryCapacity });
    const sync = createSpatialBrainSync(brain, {
        visionCone: visionConeOverride ?? config.visionCone,
        navMemoryStepPenalty: config.navMemoryStepPenalty,
        navMemoryStepFalloff: config.navMemoryStepFalloff,
    });
    return { brain, sync };
}
function chainMemberProps(state, headId) {
    const ids = getConnectedBodyIds(state.kinetic, headId);
    const members = [];
    for (let i = 0; i < ids.length; i++) members.push(state.entityRegistry.getLive(ids[i]));
    return members;
}
function replenishSnakeGoals(state, headId, rng, navWalkable) {
    const config = getSnakeGameConfig();
    const live = countLiveSnakeGoals(state);
    if (live >= config.goalCount) return;
    const occupied = linkedChainOccupiedCellKeys(chainMemberProps(state, headId), state.obstacleGrid);
    spawnGoalOrbOnOpenCell(state, navWalkable, { excludeKeys: occupied, rng });
}
function runSnakeFsmTick(intent, seeker, state, dt) {
    const snakeGame = state.sandbox.snakeGame;
    if (snakeGame._batchingPerception) ensureSnakePerceptionTick(state);
    else maybeBeginSnakeAutosimTick(state);
    intent.perceive(seeker, state);
    const choice = intent.transition(seeker, state);
    intent.headNav.tick(seeker, dt);
    return choice;
}
export function createSnakeAutosim(state, { headId, goalPropId = null, navWalkable, eatRadius, ballType, growDirX, growDirY, rng = Math.random, visionCone = null }) {
    const config = getSnakeGameConfig();
    let tailId = null;
    let pinnedGoalId = goalPropId;
    const members = chainMemberProps(state, headId);
    tailId = members[members.length - 1].id;
    const resolvedBallType = ballType ?? config.segmentPropId;
    const resolvedGrowDirX = growDirX ?? config.growDirX;
    const resolvedGrowDirY = growDirY ?? config.growDirY;
    const resolvedEatRadius = eatRadius ?? (() => resolveSnakeEatRadius(config, getSnakeChainRadius(state, headId)));
    const registry = state.sandbox.snakeGame.registry;
    const { brain, sync } = createSnakeBrain(visionCone);
    const headNav = createCellTargetHpaNav(state);
    const resolvedVisionCone = visionCone ?? config.visionCone;
    const resolveVisibleFood = (seeker, gameState, visionContext = null) => {
        const nearest = visionContext
            ? findNearestVisibleSnakeGoalFromVision(gameState, seeker, visionContext.frame, visionContext.vision, visionContext.visionCone)
            : findNearestVisibleSnakeGoal(gameState, seeker, resolvedVisionCone);
        if (pinnedGoalId != null) {
            const pinned = gameState.entityRegistry.getLive(pinnedGoalId);
            if (pinned) {
                if (nearest && nearest.id === pinned.id) return pinned;
            } else pinnedGoalId = null;
        }
        return nearest;
    };
    const intent = createSnakeForageIntent({
        brain,
        sync,
        headNav,
        resolveVisibleFood,
        resolveExploreCell: (seeker, gameState, memory, exploreRng) => resolveSnakeExploreCell(seeker, gameState, memory, exploreRng, navWalkable),
        selfHeadId: headId,
        registry,
        navWalkable,
        visionCone: resolvedVisionCone,
        rng,
    });
    let active = false;
    const foodTimer = createSnakeFoodTimer(config.starvationIntervalSec);
    const syncTailId = () => {
        const liveMembers = chainMemberProps(state, headId);
        tailId = liveMembers[liveMembers.length - 1].id;
    };
    const resolveSeeker = () => state.entityRegistry.getLive(headId);
    const eatGoal = (seeker, goal, dt) => {
        resetSnakeFoodTimer(foodTimer, config.starvationIntervalSec);
        const goalCell = state.obstacleGrid.worldToGrid(goal.x, goal.y);
        brain.stampArrival(goalCell.col, goalCell.row);
        removeSnakeGoalProp(state, goal);
        if (pinnedGoalId === goal.id) pinnedGoalId = null;
        intent.headNav.clearDestination();
        const grow = growSnakeChainAfterMeal(state, headId);
        const tail = state.entityRegistry.getLive(tailId);
        const newTail = growChainSegment(state, tail, {
            spacing: grow.spacing,
            segmentRadius: grow.segmentRadius,
            linkSlack: grow.linkSlack,
            ballType: resolvedBallType,
            growDirX: resolvedGrowDirX,
            growDirY: resolvedGrowDirY,
            exportType: SNAKE_CHAIN_EXPORT_TYPE,
        });
        copySnakeChainTintFromHead(state, headId, newTail);
        applySnakeSegmentGameplay(newTail);
        tailId = newTail.id;
        replenishSnakeGoals(state, headId, rng, navWalkable);
        runSnakeFsmTick(intent, seeker, state, dt);
    };
    return {
        headId,
        start() {
            active = true;
            resetSnakeFoodTimer(foodTimer, config.starvationIntervalSec);
            intent.resetMode();
            intent.resetMemory();
            runSnakeFsmTick(intent, resolveSeeker(), state, 0);
        },
        stop() {
            active = false;
            intent.clear(resolveSeeker(), state);
        },
        isActive() {
            return active;
        },
        getMode() {
            return intent.getMode();
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
            return getSnakeFoodTimerFraction(foodTimer);
        },
        getFsmDebugLine() {
            return formatSnakeFsmDebug(this.getFsmSnapshot());
        },
        getPathOverlay() {
            return intent.headNav.getPathOverlay(resolveSeeker());
        },
        tick(dt) {
            if (!active) return;
            const seeker = resolveSeeker();
            const choice = runSnakeFsmTick(intent, seeker, state, dt);
            let fedThisTick = false;
            if (choice.mode === "seek_food" && choice.target) {
                const goal = choice.target;
                const dist = Math.hypot(goal.x - seeker.x, goal.y - seeker.y);
                const radius = typeof resolvedEatRadius === "function" ? resolvedEatRadius() : resolvedEatRadius;
                if (dist <= radius) {
                    eatGoal(seeker, goal, dt);
                    fedThisTick = true;
                }
            }
            if (!fedThisTick && tickSnakeFoodTimer(state, headId, foodTimer, dt)) syncTailId();
        },
    };
}
