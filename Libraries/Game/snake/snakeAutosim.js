import { getConnectedBodyIds } from "../../Motion/kineticConstraintGraph.js";
import { growChainSegment } from "../../Sandbox/spawnLinkedBallChain.js";
import { removeSandboxWorldProp } from "../../Sandbox/sandboxPlacedSpawn.js";
import { createBrain } from "../../AI/brain/createBrain.js";
import { createSpatialBrainSync } from "../../AI/brain/syncSpatialBrain.js";
import { createSnakeForageIntent } from "./createSnakeForageIntent.js";
import { createCellTargetHpaNav } from "../../Sandbox/groundNav/cellTargetHpaNav.js";
import { getKineticRollConfig } from "../../Sandbox/kineticRollActuator.js";
import { getSnakeGameConfig, resolveSnakeEatRadius, applySnakeSegmentGameplay } from "./snakeGameConfig.js";
import { SNAKE_CHAIN_EXPORT_TYPE } from "./snakeScene.js";
import { getSnakeChainRadius, growSnakeChainAfterMeal } from "./snakeScale.js";
import { copySnakeChainTintFromHead } from "./snakeChainColor.js";
import { canAgentEatSnakeFood, findNearestVisibleSnakeFood, findNearestVisibleSnakeFoodFromVision, isSnakeShardFood } from "./snakeFood.js";
import { resolveSnakeExploreCell } from "./snakeExplore.js";
import { createSnakeMetabolism, feedSnakeMetabolism, getSnakeHunger, setSnakeHunger, tickSnakeMetabolism } from "./snakeStarvation.js";
import { enforceSnakeMinLength } from "./snakeCombat.js";
import { getSnakeInstance } from "./SnakeInstance.js";
import { tickAgentIntent } from "./snakeAgentLifecycle.js";
export function createSnakeBrain(visionRangeOverride) {
    const config = getSnakeGameConfig();
    const brain = createBrain({ spatialMemoryCapacity: config.spatialMemoryCapacity });
    const sync = createSpatialBrainSync(brain, {
        visionRange: visionRangeOverride ?? config.visionRange,
        navMemoryStepPenalty: config.navMemoryStepPenalty,
        navMemoryStepFalloff: config.navMemoryStepFalloff,
    });
    return { brain, sync };
}
function chainMemberProps(state, headId) {
    const ids = getConnectedBodyIds(state.kinetic, headId);
    const members = [];
    for (let i = 0; i < ids.length; i++) {
        const member = state.entityRegistry.getLive(ids[i]);
        if (member) members.push(member);
    }
    return members;
}
function resolveChainTailProp(state, headId) {
    const members = chainMemberProps(state, headId);
    const tail = members[members.length - 1];
    if (!tail) throw new Error(`Cannot grow snake ${headId}: no live tail segment`);
    return tail;
}
function runSnakeFsmTick(intent, seeker, state, dt, beforeNav = null) {
    let choice;
    tickAgentIntent(state, intent, dt, (head) => {
        intent.perceive(head, state);
        choice = intent.transition(head, state);
        if (beforeNav) beforeNav(head);
    });
    return choice;
}
export function createSnakeAutosim(state, { headId, navWalkable, eatRadius, ballType, growDirX, growDirY, rng = Math.random, visionRange = null, initialFoodFraction = 1 }) {
    const config = getSnakeGameConfig();
    let tailId = null;
    const members = chainMemberProps(state, headId);
    tailId = members[members.length - 1].id;
    const resolvedBallType = ballType ?? config.segmentPropId;
    const resolvedGrowDirX = growDirX ?? config.growDirX;
    const resolvedGrowDirY = growDirY ?? config.growDirY;
    const resolvedEatRadius = eatRadius ?? (() => resolveSnakeEatRadius(config, getSnakeChainRadius(state, headId)));
    const resolveHuntArrivalRadius = () => Math.max(2, getSnakeChainRadius(state, headId) * 0.25);
    const registry = state.sandbox.snakeGame.registry;
    const { brain, sync } = createSnakeBrain(visionRange);
    const headNav = createCellTargetHpaNav(state);
    const resolvedVisionRange = visionRange ?? config.visionRange;
    const metabolism = createSnakeMetabolism();
    const resolveVisibleFood = (seeker, gameState, visionContext = null) => {
        return visionContext
            ? findNearestVisibleSnakeFoodFromVision(gameState, seeker, visionContext.frame, visionContext.vision, visionContext.visionRange)
            : findNearestVisibleSnakeFood(gameState, seeker, resolvedVisionRange);
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
        visionRange: resolvedVisionRange,
        seekArrivalRadius: (mode, agent, target) => {
            const terminalHoming = config.terminalHoming;
            if (mode === "seek_ally") {
                const cohesion = config.factionCohesion ?? {};
                return { arrivalRadius: cohesion.arrivalRadius ?? 32, lockOnTarget: true, terminalHoming };
            }
            if (mode === "seek_prey") return { arrivalRadius: resolveHuntArrivalRadius(), lockOnTarget: true, terminalHoming };
            if (!isSnakeShardFood(target)) return { arrivalRadius: resolveHuntArrivalRadius(), lockOnTarget: true, terminalHoming };
            return { arrivalRadius: typeof resolvedEatRadius === "function" ? resolvedEatRadius() : resolvedEatRadius, lockOnTarget: true, terminalHoming };
        },
        resolveHunger: () => getSnakeHunger(metabolism),
        resolveSegmentCount: () => chainMemberProps(state, headId).length,
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
        const want = intent.getDecisionSnapshot()?.sprintIntent?.want === true;
        sprinting = want && segmentCount > config.minAliveSegmentCount;
        const nav = seeker.strategy.groundNav ?? (seeker.strategy.groundNav = {});
        nav.maxSpeed = sprinting ? baseMaxSpeed * config.sprint.speedMultiplier : baseMaxSpeed;
        nav.accel = sprinting ? baseAccel * config.sprint.accelMultiplier : baseAccel;
    };
    const syncTailId = () => {
        tailId = resolveChainTailProp(state, headId).id;
    };
    const resolveSeeker = () => state.entityRegistry.getLive(headId);
    const growOneSegment = (members = null) => {
        const grow = growSnakeChainAfterMeal(state, headId, members);
        const tail = resolveChainTailProp(state, headId);
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
    const feedAndGrow = (foodValue, members = null) => {
        let pending = feedSnakeMetabolism(metabolism, foodValue);
        while (pending > 0 && chainMemberProps(state, headId).length < config.maxAliveSegmentCount) {
            growOneSegment(members);
            pending--;
        }
    };
    const eatFoodShard = (seeker, food, _dt, members = null) => {
        if (!canAgentEatSnakeFood(seeker, food)) return;
        const grid = state.obstacleGrid;
        brain.stampArrival(grid.worldCol(food.x), grid.worldRow(food.y));
        intent.clearTrackedGoal();
        intent.headNav.clearDestination();
        removeSandboxWorldProp(state, food);
        feedAndGrow(food.snakeFoodValue ?? config.metabolism.foodValue, members);
    };
    return {
        headId,
        start() {
            active = true;
            setSnakeHunger(metabolism, initialFoodFraction);
            intent.resetMode();
            intent.resetMemory();
            runSnakeFsmTick(intent, resolveSeeker(), state, 0);
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
            if (intent.getMode() === "seek_food" && intent.getTargetId() != null) {
                const food = state.entityRegistry.getLive(intent.getTargetId());
                if (food && !food.isDead && isSnakeShardFood(food)) {
                    const dist = Math.hypot(food.x - seeker.x, food.y - seeker.y);
                    const radius = typeof resolvedEatRadius === "function" ? resolvedEatRadius() : resolvedEatRadius;
                    if (dist <= radius) {
                        eatFoodShard(seeker, food, dtMs, members);
                        return;
                    }
                }
            }
            const choice = runSnakeFsmTick(intent, seeker, state, dtMs, (s) => applySprintState(s, members.length));
            let fedThisTick = false;
            if (choice.mode === "seek_food" && choice.target) {
                const food = choice.target;
                if (isSnakeShardFood(food)) {
                    const dist = Math.hypot(food.x - seeker.x, food.y - seeker.y);
                    const radius = typeof resolvedEatRadius === "function" ? resolvedEatRadius() : resolvedEatRadius;
                    if (dist <= radius) {
                        eatFoodShard(seeker, food, dtMs, members);
                        fedThisTick = true;
                    }
                }
            }
            const drainMultiplier = sprinting ? config.sprint.hungerDrainMultiplier : 1;
            if (!fedThisTick && tickSnakeMetabolism(state, headId, metabolism, dtMs, members, drainMultiplier)) syncTailId();
        },
    };
}
