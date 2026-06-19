import { getSandboxEntityMeta } from "../../../GameState/sandboxEntityMeta.js";
import { getChainMemberIds } from "../../Sandbox/chainLinks.js";
import { linkedChainOccupiedCellKeys, growChainSegment } from "../../Sandbox/spawnLinkedBallChain.js";
import { removeSandboxWorldProp } from "../../Sandbox/sandboxPlacedSpawn.js";
import { createSnakePredatorPreyIntent } from "../../AI/agentIntent/createSnakePredatorPreyIntent.js";
import { getSnakeGameConfig, resolveSnakeEatRadius } from "./snakeGameConfig.js";
import { SNAKE_CHAIN_EXPORT_TYPE, spawnGoalOrbOnOpenCell } from "./snakeScene.js";
import { getSnakeChainRadius, growSnakeChainAfterMeal } from "./snakeScale.js";
import { copySnakeChainTintFromHead } from "./snakeChainColor.js";
import { countLiveSnakeGoals, findNearestVisibleSnakeGoal } from "./snakeGoals.js";
import { createSnakeBrain } from "./snakeBrain.js";
import { resolveSnakeExploreCell } from "./snakeExplore.js";
import { createSnakeLifecycleRegistry, registerAliveSnake } from "./snakeLifecycle.js";
import { createSnakeFoodTimer, getSnakeFoodTimerFraction, resetSnakeFoodTimer, tickSnakeFoodTimer } from "./snakeStarvation.js";
export { findSnakeGoalProp, collectSnakeGoalProps, countLiveSnakeGoals, findNearestSnakeGoal, findNearestVisibleSnakeGoal } from "./snakeGoals.js";
function chainMemberProps(state, headId) {
    const ids = getChainMemberIds(state, headId);
    const members = [];
    for (let i = 0; i < ids.length; i++) {
        const prop = state.entityRegistry.getLive(ids[i]);
        if (prop && !prop.isDead) members.push(prop);
    }
    return members;
}
function replenishSnakeGoals(state, headId, rng) {
    const config = getSnakeGameConfig();
    const live = countLiveSnakeGoals(state);
    if (live >= config.goalCount) return;
    const occupied = linkedChainOccupiedCellKeys(chainMemberProps(state, headId), state.obstacleGrid);
    spawnGoalOrbOnOpenCell(state, { excludeKeys: occupied, rng });
}
function resolveSnakeGameRegistry(state, headId) {
    const snakeGame = state.sandbox.snakeGame;
    if (snakeGame?.registry) return snakeGame.registry;
    const registry = createSnakeLifecycleRegistry();
    registerAliveSnake(registry, headId);
    state.sandbox.snakeGame = { registry, autosimsByHeadId: snakeGame?.autosimsByHeadId ?? new Map() };
    return registry;
}
export function createSnakeAutosim(state, { headId, goalPropId = null, behaviorById, eatRadius, ballType, growDirX, growDirY, rng = Math.random, visionCone = null }) {
    const config = getSnakeGameConfig();
    let tailId = null;
    let pinnedGoalId = goalPropId;
    const head = state.entityRegistry.getLive(headId);
    if (!head || head.isDead) throw new Error("Snake autosim requires a live chain head prop");
    const members = chainMemberProps(state, headId);
    if (!members.length) throw new Error("Snake autosim chain head has no members");
    tailId = members[members.length - 1].id;
    const resolvedBallType = ballType ?? config.segmentPropId;
    const resolvedGrowDirX = growDirX ?? config.growDirX;
    const resolvedGrowDirY = growDirY ?? config.growDirY;
    const resolvedEatRadius = eatRadius ?? (() => resolveSnakeEatRadius(config, getSnakeChainRadius(state, headId)));
    const meta = getSandboxEntityMeta(state);
    const registry = resolveSnakeGameRegistry(state, headId);
    const { brain, sync } = createSnakeBrain({ visionCone });
    const resolveVisibleFood = (seeker, gameState) => {
        if (pinnedGoalId != null) {
            const pinned = gameState.entityRegistry.getLive(pinnedGoalId);
            if (pinned && !pinned.isDead) {
                const visible = findNearestVisibleSnakeGoal(gameState, seeker, config.visionCone);
                if (visible?.id === pinned.id) return pinned;
            } else pinnedGoalId = null;
        }
        return findNearestVisibleSnakeGoal(gameState, seeker, config.visionCone);
    };
    const intent = createSnakePredatorPreyIntent({
        brain,
        sync,
        behaviorById,
        setActiveBehaviorId: (propId, behaviorId) => meta.setActiveBehaviorId(propId, behaviorId),
        resolveVisibleFood,
        resolveExploreCell: resolveSnakeExploreCell,
        selfHeadId: headId,
        registry,
        visionCone: visionCone ?? config.visionCone,
        rng,
    });
    let active = false;
    const foodTimer = createSnakeFoodTimer(config.starvationIntervalSec);
    const syncTailId = () => {
        const liveMembers = chainMemberProps(state, headId);
        tailId = liveMembers.length ? liveMembers[liveMembers.length - 1].id : headId;
    };
    const resolveSeeker = () => state.entityRegistry.getLive(headId);
    const eatGoal = (seeker, goal) => {
        resetSnakeFoodTimer(foodTimer, config.starvationIntervalSec);
        const goalCell = state.obstacleGrid.worldToGrid(goal.x, goal.y);
        brain.stampArrival(goalCell.col, goalCell.row);
        removeSandboxWorldProp(state, goal);
        if (pinnedGoalId === goal.id) pinnedGoalId = null;
        intent.clearTrackedTarget();
        intent.navBehavior().clearMoveTarget(seeker);
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
        tailId = newTail.id;
        replenishSnakeGoals(state, headId, rng);
        intent.refresh(seeker, state);
    };
    return {
        start() {
            active = true;
            resetSnakeFoodTimer(foodTimer, config.starvationIntervalSec);
            intent.resetMode();
            intent.resetMemory();
            const seeker = resolveSeeker();
            if (seeker) {
                intent.sync(seeker, state);
                intent.refresh(seeker, state);
            }
        },
        stop() {
            active = false;
            const seeker = resolveSeeker();
            if (seeker) intent.clear(seeker);
        },
        isActive() {
            return active;
        },
        getMode() {
            return intent.getMode();
        },
        getTrackedTargetId() {
            return intent.getTrackedTargetId();
        },
        getBrain() {
            return brain;
        },
        getFoodTimerFraction() {
            return getSnakeFoodTimerFraction(foodTimer);
        },
        tick(dt) {
            if (!active) return;
            let fedThisTick = false;
            const seeker = resolveSeeker();
            if (!seeker || seeker.isDead) return;
            intent.sync(seeker, state);
            const choice = intent.refresh(seeker, state);
            if (choice.mode === "seek_food" && choice.target) {
                const goal = choice.target;
                const dist = Math.hypot(goal.x - seeker.x, goal.y - seeker.y);
                const radius = typeof resolvedEatRadius === "function" ? resolvedEatRadius() : resolvedEatRadius;
                if (dist <= radius) {
                    eatGoal(seeker, goal);
                    fedThisTick = true;
                }
            }
            if (!fedThisTick && tickSnakeFoodTimer(state, headId, foodTimer, dt)) syncTailId();
        },
    };
}
