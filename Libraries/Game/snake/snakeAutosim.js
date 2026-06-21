import { getConnectedBodyIds } from "../../Motion/kineticConstraintGraph.js";
import { linkedChainOccupiedCellIndices, growChainSegment } from "../../Sandbox/spawnLinkedBallChain.js";
import { removeSandboxWorldProp } from "../../Sandbox/sandboxPlacedSpawn.js";
import { createBrain } from "../../AI/brain/createBrain.js";
import { createSpatialBrainSync } from "../../AI/brain/syncSpatialBrain.js";
import { createSnakeForageIntent } from "./createSnakeForageIntent.js";
import { formatSnakeFsmDebug } from "./snakeFsmDebugOverlays.js";
import { createCellTargetHpaNav } from "../../Sandbox/groundNav/cellTargetHpaNav.js";
import { getKineticRollConfig } from "../../Sandbox/kineticRollActuator.js";
import { getSnakeGameConfig, resolveSnakeEatRadius, applySnakeSegmentGameplay } from "./snakeGameConfig.js";
import { SNAKE_CHAIN_EXPORT_TYPE, pickGoalRelocateCell, relocateGoalOrb } from "./snakeScene.js";
import { getSnakeChainRadius, growSnakeChainAfterMeal } from "./snakeScale.js";
import { copySnakeChainTintFromHead, resolveSnakeChainTintHex, tintSnakeChain } from "./snakeChainColor.js";
import { deriveSnakeHungerState } from "./snakeDecisionModel.js";
import { findNearestVisibleSnakeGoal, findNearestVisibleSnakeGoalFromVision } from "./snakeGoals.js";
import { resolveSnakeExploreCell } from "./snakeExplore.js";
import { createSnakeMetabolism, feedSnakeMetabolism, getSnakeHunger, setSnakeHunger, tickSnakeMetabolism } from "./snakeStarvation.js";
import { enforceSnakeMinLength } from "./snakeCombat.js";
import { getSnakeInstance } from "./SnakeInstance.js";
import { ensureSnakePerceptionTick, maybeBeginSnakeAutosimTick, endSnakePerceptionFrame } from "./snakePerception.js";
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
function runSnakeFsmTick(intent, seeker, state, dt, beforeNav = null) {
    const snakeGame = state.sandbox.snakeGame;
    const soloTick = !snakeGame._batchingPerception;
    if (snakeGame._batchingPerception) ensureSnakePerceptionTick(state);
    else maybeBeginSnakeAutosimTick(state);
    intent.perceive(seeker, state);
    const choice = intent.transition(seeker, state);
    if (beforeNav) beforeNav(seeker);
    intent.headNav.tick(seeker, dt);
    if (soloTick) endSnakePerceptionFrame(state);
    return choice;
}
export function createSnakeAutosim(state, { headId, goalPropId = null, navWalkable, eatRadius, ballType, growDirX, growDirY, rng = Math.random, visionCone = null, initialFoodFraction = 1 }) {
    const config = getSnakeGameConfig();
    let tailId = null;
    let pinnedGoalId = goalPropId;
    const members = chainMemberProps(state, headId);
    tailId = members[members.length - 1].id;
    const resolvedBallType = ballType ?? config.segmentPropId;
    const resolvedGrowDirX = growDirX ?? config.growDirX;
    const resolvedGrowDirY = growDirY ?? config.growDirY;
    const resolvedEatRadius = eatRadius ?? (() => resolveSnakeEatRadius(config, getSnakeChainRadius(state, headId)));
    const resolveHuntArrivalRadius = () => Math.max(2, getSnakeChainRadius(state, headId) * 0.25);
    const registry = state.sandbox.snakeGame.registry;
    const { brain, sync } = createSnakeBrain(visionCone);
    const headNav = createCellTargetHpaNav(state);
    const resolvedVisionCone = visionCone ?? config.visionCone;
    const metabolism = createSnakeMetabolism();
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
        seekArrivalRadius: (mode) => {
            if (mode === "seek_prey") return { arrivalRadius: resolveHuntArrivalRadius(), lockOnTarget: true };
            return { arrivalRadius: typeof resolvedEatRadius === "function" ? resolvedEatRadius() : resolvedEatRadius, lockOnTarget: true };
        },
        resolveHunger: () => getSnakeHunger(metabolism),
        rng,
    });
    let active = false;
    let tintedTint = null;
    let sprinting = false;
    let baseMaxSpeed = null;
    let baseAccel = null;
    const pendingPreyFoodRewards = [];
    const applySprintState = (seeker, segmentCount) => {
        if (baseMaxSpeed === null) {
            const baseRoll = getKineticRollConfig(seeker);
            baseMaxSpeed = baseRoll.maxSpeed;
            baseAccel = baseRoll.accel;
        }
        const want = intent.getDecisionSnapshot()?.sprintIntent?.want === true;
        sprinting = want && segmentCount > config.minAliveSegmentCount;
        const nav = seeker.strategy.groundNav ?? (seeker.strategy.groundNav = {});
        nav.maxSpeed = sprinting ? baseMaxSpeed * config.sprint.speedMultiplier : baseMaxSpeed;
        nav.accel = sprinting ? baseAccel * config.sprint.accelMultiplier : baseAccel;
    };
    const syncTailId = () => {
        const liveMembers = chainMemberProps(state, headId);
        tailId = liveMembers[liveMembers.length - 1].id;
    };
    const resolveSeeker = () => state.entityRegistry.getLive(headId);
    const syncIntentTint = () => {
        const hungerState = deriveSnakeHungerState(getSnakeHunger(metabolism));
        const tint = resolveSnakeChainTintHex(intent.getMode(), hungerState);
        if (!tint || tint === tintedTint) return;
        tintSnakeChain(state, headId, tint);
        tintedTint = tint;
    };
    const growOneSegment = (members = null) => {
        const grow = growSnakeChainAfterMeal(state, headId, members);
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
    };
    const feedAndGrow = (members = null) => {
        let pending = feedSnakeMetabolism(metabolism);
        while (pending > 0 && chainMemberProps(state, headId).length < config.maxAliveSegmentCount) {
            growOneSegment(members);
            pending--;
        }
    };
    const eatGoal = (seeker, goal, _dt, members = null) => {
        const grid = state.obstacleGrid;
        const goalCell = grid.worldToGrid(goal.x, goal.y);
        brain.stampArrival(goalCell.col, goalCell.row);
        if (pinnedGoalId === goal.id) pinnedGoalId = null;
        intent.clearTrackedGoal();
        intent.headNav.clearDestination();
        feedAndGrow(members);
        const seekerCell = grid.worldToGrid(seeker.x, seeker.y);
        const occupied = linkedChainOccupiedCellIndices(chainMemberProps(state, headId), grid);
        const newCell = pickGoalRelocateCell(state, navWalkable, seekerCell, { excludeIndices: occupied, rng });
        if (!newCell) return;
        relocateGoalOrb(state, goal, newCell, { skipHeadId: headId });
    };
    const applyPendingPreyFoodRewards = () => {
        if (!pendingPreyFoodRewards.length) return false;
        while (pendingPreyFoodRewards.length) {
            const preyCell = pendingPreyFoodRewards.shift();
            if (preyCell) brain.stampArrival(preyCell.col, preyCell.row);
            feedAndGrow();
        }
        intent.clearTrackedGoal();
        intent.headNav.clearDestination();
        return true;
    };
    const onGoalRelocated = (goal) => {
        if (!active || intent.getTargetId() !== goal.id || intent.getMode() !== "seek_food") return;
        const seeker = resolveSeeker();
        if (!seeker) return;
        const cell = state.obstacleGrid.worldToGrid(goal.x, goal.y);
        intent.headNav.setDestination(state.obstacleGrid, cell.col, cell.row);
    };
    return {
        headId,
        start() {
            active = true;
            setSnakeHunger(metabolism, initialFoodFraction);
            intent.resetMode();
            intent.resetMemory();
            runSnakeFsmTick(intent, resolveSeeker(), state, 0);
            syncIntentTint();
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
            return getSnakeHunger(metabolism);
        },
        isSprinting() {
            return sprinting;
        },
        onPreyKilled(preyHead) {
            pendingPreyFoodRewards.push(preyHead ? state.obstacleGrid.worldToGrid(preyHead.x, preyHead.y) : null);
        },
        flushPendingPreyFoodRewards() {
            return applyPendingPreyFoodRewards();
        },
        getFsmDebugLine() {
            return formatSnakeFsmDebug(this.getFsmSnapshot());
        },
        getPathOverlay() {
            return intent.headNav.getPathOverlay(resolveSeeker());
        },
        /** @param {number} dtMs */
        tick(dtMs) {
            if (!active) return;
            const snakeGame = state.sandbox.snakeGame;
            const seeker = resolveSeeker();
            const members = getConnectedBodyIds(state.kinetic, headId);
            const instance = getSnakeInstance(snakeGame, headId);
            if (!instance || instance.lifecycle !== "alive") return;
            if (!seeker || !instance.isSteerable(state, snakeGame.registry)) {
                instance.die(state, snakeGame, members);
                return;
            }
            if (enforceSnakeMinLength(state, snakeGame, headId, members)) return;
            if (applyPendingPreyFoodRewards()) return;
            if (intent.getMode() === "seek_food" && intent.getTargetId() != null) {
                const goal = state.entityRegistry.getLive(intent.getTargetId());
                if (goal && !goal.isDead) {
                    const dist = Math.hypot(goal.x - seeker.x, goal.y - seeker.y);
                    const radius = typeof resolvedEatRadius === "function" ? resolvedEatRadius() : resolvedEatRadius;
                    if (dist <= radius) {
                        eatGoal(seeker, goal, dtMs, members);
                        return;
                    }
                }
            }
            const choice = runSnakeFsmTick(intent, seeker, state, dtMs, (s) => applySprintState(s, members.length));
            syncIntentTint();
            let fedThisTick = false;
            if (choice.mode === "seek_food" && choice.target) {
                const goal = choice.target;
                const dist = Math.hypot(goal.x - seeker.x, goal.y - seeker.y);
                const radius = typeof resolvedEatRadius === "function" ? resolvedEatRadius() : resolvedEatRadius;
                if (dist <= radius) {
                    eatGoal(seeker, goal, dtMs, members);
                    fedThisTick = true;
                }
            }
            const drainMultiplier = sprinting ? config.sprint.hungerDrainMultiplier : 1;
            if (!fedThisTick && tickSnakeMetabolism(state, headId, metabolism, dtMs, members, drainMultiplier)) syncTailId();
        },
        onGoalRelocated,
    };
}
