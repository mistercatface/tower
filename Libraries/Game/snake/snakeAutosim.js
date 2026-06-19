import { getSandboxEntityMeta } from "../../../GameState/sandboxEntityMeta.js";
import { getChainMemberIds } from "../../Sandbox/chainLinks.js";
import { linkedChainOccupiedCellKeys, growChainSegment } from "../../Sandbox/spawnLinkedBallChain.js";
import { removeSandboxWorldProp } from "../../Sandbox/sandboxPlacedSpawn.js";
import { createSeekExploreIntent } from "../../AI/agentIntent/createSeekExploreIntent.js";
import { getSnakeGameConfig, resolveSnakeEatRadius } from "./snakeGameConfig.js";
import { SNAKE_CHAIN_EXPORT_TYPE, spawnGoalOrbOnOpenCell } from "./snakeScene.js";
import { getSnakeChainRadius, growSnakeChainAfterMeal } from "./snakeScale.js";
import { copySnakeChainTintFromHead } from "./snakeChainColor.js";
import { countLiveSnakeGoals, findNearestVisibleSnakeGoal } from "./snakeGoals.js";
import { createSnakeBrain } from "./snakeBrain.js";
import { resolveSnakeExploreCell } from "./snakeExplore.js";
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
    const { brain, sync } = createSnakeBrain({ visionCone });
    const resolveVisibleGoal = (seeker, gameState) => {
        if (pinnedGoalId != null) {
            const pinned = gameState.entityRegistry.getLive(pinnedGoalId);
            if (pinned && !pinned.isDead) {
                const visible = findNearestVisibleSnakeGoal(gameState, seeker, config.visionCone);
                if (visible?.id === pinned.id) return pinned;
            } else pinnedGoalId = null;
        }
        return findNearestVisibleSnakeGoal(gameState, seeker, config.visionCone);
    };
    const intent = createSeekExploreIntent({
        brain,
        sync,
        behaviorById,
        setActiveBehaviorId: (propId, behaviorId) => meta.setActiveBehaviorId(propId, behaviorId),
        resolveVisibleGoal,
        resolveExploreCell: resolveSnakeExploreCell,
        rng,
    });
    let active = false;
    const resolveSeeker = () => state.entityRegistry.getLive(headId);
    return {
        start() {
            active = true;
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
        getBrain() {
            return brain;
        },
        tick(_dt) {
            if (!active) return;
            const seeker = resolveSeeker();
            if (!seeker || seeker.isDead) return;
            intent.sync(seeker, state);
            const goal = resolveVisibleGoal(seeker, state);
            if (goal) {
                intent.enterSeek(seeker, goal, state);
                const dist = Math.hypot(goal.x - seeker.x, goal.y - seeker.y);
                const radius = typeof resolvedEatRadius === "function" ? resolvedEatRadius() : resolvedEatRadius;
                if (dist <= radius) {
                    const goalCell = state.obstacleGrid.worldToGrid(goal.x, goal.y);
                    brain.stampArrival(goalCell.col, goalCell.row);
                    removeSandboxWorldProp(state, goal);
                    if (pinnedGoalId === goal.id) pinnedGoalId = null;
                    intent.clearTrackedGoal();
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
                } else if (goal.id !== intent.getTrackedGoalId()) intent.enterSeek(seeker, goal, state);
                else if (!intent.hasMoveTarget(seeker)) intent.enterSeek(seeker, goal, state);
                return;
            }
            intent.refresh(seeker, state);
        },
    };
}
