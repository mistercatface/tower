import { getChainMemberIds } from "../../Sandbox/chainLinks.js";
import { createGoalSeekAutosim } from "../../Sandbox/autosim/goalSeekAutosim.js";
import { HPA_GROUND_NAV_BEHAVIOR_ID } from "../../Sandbox/groundNav/groundNavIds.js";
import { linkedChainOccupiedCellKeys, growChainSegment } from "../../Sandbox/spawnLinkedBallChain.js";
import { removeSandboxWorldProp } from "../../Sandbox/sandboxPlacedSpawn.js";
import { getSnakeGameConfig, resolveSnakeEatRadius, resolveSnakeSegmentSpacing } from "./snakeGameConfig.js";
import { SNAKE_CHAIN_EXPORT_TYPE, spawnGoalOrbOnOpenCell } from "./snakeScene.js";
export function findSnakeGoalProp(state) {
    const goalPropId = getSnakeGameConfig().goalPropId;
    let goal = null;
    state.entityRegistry.forEachOfKind("worldProp", (prop) => {
        if (prop.isDead || prop.type !== goalPropId) return;
        goal = prop;
    });
    return goal;
}
function chainMemberProps(state, headId) {
    const ids = getChainMemberIds(state, headId);
    const members = [];
    for (let i = 0; i < ids.length; i++) {
        const prop = state.entityRegistry.getLive(ids[i]);
        if (prop && !prop.isDead) members.push(prop);
    }
    return members;
}
export function createSnakeAutosim(state, { headId, goalPropId, behaviorById, eatRadius, spacing, ballType, growDirX, growDirY, rng = Math.random }) {
    const config = getSnakeGameConfig();
    let tailId = null;
    let goalId = goalPropId;
    const head = state.entityRegistry.getLive(headId);
    if (!head || head.isDead) throw new Error("Snake autosim requires a live chain head prop");
    const members = chainMemberProps(state, headId);
    if (!members.length) throw new Error("Snake autosim chain head has no members");
    tailId = members[members.length - 1].id;
    const resolvedEatRadius = eatRadius ?? resolveSnakeEatRadius(config);
    const resolvedSpacing = spacing ?? resolveSnakeSegmentSpacing(config);
    const resolvedBallType = ballType ?? config.segmentPropId;
    const resolvedGrowDirX = growDirX ?? config.growDirX;
    const resolvedGrowDirY = growDirY ?? config.growDirY;
    const chainGrowOptions = { spacing: resolvedSpacing, ballType: resolvedBallType, growDirX: resolvedGrowDirX, growDirY: resolvedGrowDirY, exportType: SNAKE_CHAIN_EXPORT_TYPE };
    return createGoalSeekAutosim(state, {
        getSeekerPropId: () => headId,
        getGoalPropId: () => goalId,
        navBehaviorId: HPA_GROUND_NAV_BEHAVIOR_ID,
        behaviorById,
        eatRadius: resolvedEatRadius,
        onConsume({ goal }) {
            removeSandboxWorldProp(state, goal);
            const tail = state.entityRegistry.getLive(tailId);
            const newTail = growChainSegment(state, tail, chainGrowOptions);
            tailId = newTail.id;
            const occupied = linkedChainOccupiedCellKeys(chainMemberProps(state, headId), state.obstacleGrid);
            const nextGoal = spawnGoalOrbOnOpenCell(state, { excludeKeys: occupied, faction: tail.faction, rng });
            goalId = nextGoal.id;
        },
    });
}
