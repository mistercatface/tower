import { getSandboxEntityMeta } from "../../../GameState/sandboxEntityMeta.js";
import { getChainMemberIds } from "../chainLinks.js";
import { HPA_GROUND_NAV_BEHAVIOR_ID } from "../groundNav/groundNavIds.js";
import { removeSandboxWorldProp } from "../sandboxPlacedSpawn.js";
import { getSnakeGameConfig, resolveSnakeEatRadius, resolveSnakeSegmentSpacing } from "../../Game/snake/snakeGameConfig.js";
import { growSnakeChainSegment, snakeChainOccupiedCellKeys, spawnGoalOrbOnOpenCell } from "../spawnSnakeChain.js";
import { createGoalSeekAutosim } from "./goalSeekAutosim.js";
export function findChainHeadProp(state) {
    const meta = getSandboxEntityMeta(state);
    let head = null;
    state.entityRegistry.forEachOfKind("worldProp", (prop) => {
        if (prop.isDead || !meta.isChainHead(prop.id)) return;
        head = prop;
    });
    return head;
}
export function findGoalOrbProp(state) {
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
export function createSnakeAutosim(state, { headId, goalPropId, behaviorById, eatRadius, spacing, ballType, rng = Math.random } = {}) {
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
    const goalSeek = createGoalSeekAutosim(state, {
        getSeekerPropId: () => headId,
        getGoalPropId: () => goalId,
        navBehaviorId: HPA_GROUND_NAV_BEHAVIOR_ID,
        behaviorById,
        eatRadius: resolvedEatRadius,
        onConsume({ goal }) {
            removeSandboxWorldProp(state, goal);
            const tail = state.entityRegistry.getLive(tailId);
            const newTail = growSnakeChainSegment(state, tail, { spacing: resolvedSpacing, ballType: resolvedBallType });
            tailId = newTail.id;
            const occupied = snakeChainOccupiedCellKeys(chainMemberProps(state, headId), state.obstacleGrid);
            const nextGoal = spawnGoalOrbOnOpenCell(state, { excludeKeys: occupied, faction: tail.faction, rng });
            goalId = nextGoal.id;
        },
    });
    return goalSeek;
}
