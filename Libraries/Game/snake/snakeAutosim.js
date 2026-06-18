import { getChainMemberIds } from "../../Sandbox/chainLinks.js";
import { createGoalSeekAutosim } from "../../Sandbox/autosim/goalSeekAutosim.js";
import { HPA_GROUND_NAV_BEHAVIOR_ID } from "../../Sandbox/groundNav/groundNavIds.js";
import { linkedChainOccupiedCellKeys, growChainSegment } from "../../Sandbox/spawnLinkedBallChain.js";
import { removeSandboxWorldProp } from "../../Sandbox/sandboxPlacedSpawn.js";
import { getSnakeGameConfig, resolveSnakeEatRadius } from "./snakeGameConfig.js";
import { SNAKE_CHAIN_EXPORT_TYPE, spawnGoalOrbOnOpenCell } from "./snakeScene.js";
import { getSnakeChainRadius, growSnakeChainAfterMeal } from "./snakeScale.js";
import { copySnakeChainPanelsFromHead } from "./snakeChainColor.js";
import { countLiveSnakeGoals, findNearestSnakeGoal } from "./snakeGoals.js";

export { findSnakeGoalProp, collectSnakeGoalProps, countLiveSnakeGoals, findNearestSnakeGoal } from "./snakeGoals.js";

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

export function createSnakeAutosim(state, { headId, goalPropId = null, behaviorById, eatRadius, ballType, growDirX, growDirY, rng = Math.random }) {
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
    const resolveGoalId = () => {
        if (pinnedGoalId != null) {
            const pinned = state.entityRegistry.getLive(pinnedGoalId);
            if (pinned && !pinned.isDead) return pinned.id;
            pinnedGoalId = null;
        }
        const seeker = state.entityRegistry.getLive(headId);
        if (!seeker || seeker.isDead) return null;
        const goal = findNearestSnakeGoal(state, seeker.x, seeker.y);
        return goal?.id ?? null;
    };
    return createGoalSeekAutosim(state, {
        getSeekerPropId: () => headId,
        getGoalPropId: resolveGoalId,
        navBehaviorId: HPA_GROUND_NAV_BEHAVIOR_ID,
        behaviorById,
        eatRadius: resolvedEatRadius,
        onConsume({ goal }) {
            removeSandboxWorldProp(state, goal);
            if (pinnedGoalId === goal.id) pinnedGoalId = null;
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
            copySnakeChainPanelsFromHead(state, headId, newTail);
            tailId = newTail.id;
            replenishSnakeGoals(state, headId, rng);
        },
    });
}
