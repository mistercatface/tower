import { getSandboxEntityMeta } from "../../../GameState/sandboxEntityMeta.js";
import { getChainMemberIds } from "../../Sandbox/chainLinks.js";
import { DIRECT_GROUND_NAV_BEHAVIOR_ID, HPA_GROUND_NAV_BEHAVIOR_ID } from "../../Sandbox/groundNav/groundNavIds.js";
import { linkedChainOccupiedCellKeys, growChainSegment } from "../../Sandbox/spawnLinkedBallChain.js";
import { removeSandboxWorldProp } from "../../Sandbox/sandboxPlacedSpawn.js";
import { cavernCellKey, collectOpenCavernCells, pickOpenCavernCell } from "../../Sandbox/cavernFloorCells.js";
import { pickExploreDestination } from "../../Navigation/steering/exploreSteering.js";
import { getSnakeGameConfig, resolveSnakeEatRadius } from "./snakeGameConfig.js";
import { SNAKE_CHAIN_EXPORT_TYPE, spawnGoalOrbOnOpenCell } from "./snakeScene.js";
import { getSnakeChainRadius, growSnakeChainAfterMeal } from "./snakeScale.js";
import { copySnakeChainTintFromHead } from "./snakeChainColor.js";
import { countLiveSnakeGoals, findNearestVisibleSnakeGoal } from "./snakeGoals.js";
import { createSnakeBrain } from "./snakeBrain.js";
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
function resolveExploreCell(state, originCol, originRow, memory, rng) {
    const config = getSnakeGameConfig();
    const grid = state.obstacleGrid;
    const openCells = collectOpenCavernCells(state);
    const minTiles = config.exploreMinTiles;
    let cell = pickExploreDestination(grid, originCol, originRow, { minTiles, memory, openCells, rng, fringeRatio: config.spatialMemoryFringeRatio });
    if (!cell && minTiles > 1) cell = pickExploreDestination(grid, originCol, originRow, { minTiles: 1, memory, openCells, rng, fringeRatio: config.spatialMemoryFringeRatio });
    if (!cell) cell = pickOpenCavernCell(openCells, { rng });
    if (cell && cell.col === originCol && cell.row === originRow) cell = pickOpenCavernCell(openCells, { excludeKeys: new Set([cavernCellKey(originCol, originRow)]), rng });
    return cell;
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
    const meta = getSandboxEntityMeta(state);
    const snakeBrain = createSnakeBrain();
    const hpaBehavior = () => behaviorById.get(HPA_GROUND_NAV_BEHAVIOR_ID);
    const directBehavior = () => behaviorById.get(DIRECT_GROUND_NAV_BEHAVIOR_ID);
    let active = false;
    let mode = "explore";
    let trackedGoalId = null;
    let exploreCellKey = null;
    const resolveSeeker = () => state.entityRegistry.getLive(headId);
    const syncBrain = (seeker) => {
        snakeBrain.sync(seeker, state);
    };
    const clearNavTargets = (seeker) => {
        hpaBehavior()?.clearMoveTarget?.(seeker);
        directBehavior()?.clearMoveTarget?.(seeker);
    };
    const resolveSeekGoal = (seeker) => {
        if (pinnedGoalId != null) {
            const pinned = state.entityRegistry.getLive(pinnedGoalId);
            if (pinned && !pinned.isDead) {
                const vision = config.visionCone;
                const visible = findNearestVisibleSnakeGoal(state, seeker, vision);
                if (visible?.id === pinned.id) return pinned;
            } else pinnedGoalId = null;
        }
        return findNearestVisibleSnakeGoal(state, seeker, config.visionCone);
    };
    const enterSeek = (seeker, goal) => {
        const hpa = hpaBehavior();
        if (!hpa?.setMoveTarget) throw new Error(`Ground nav behavior missing setMoveTarget: ${HPA_GROUND_NAV_BEHAVIOR_ID}`);
        if (mode === "seek" && trackedGoalId === goal.id && hpa.hasMoveTarget?.(seeker)) return;
        directBehavior()?.clearMoveTarget?.(seeker);
        mode = "seek";
        trackedGoalId = goal.id;
        exploreCellKey = null;
        meta.setActiveBehaviorId(seeker.id, HPA_GROUND_NAV_BEHAVIOR_ID);
        hpa.setMoveTarget(seeker, { x: goal.x, y: goal.y });
    };
    const enterExplore = (seeker) => {
        const hpa = hpaBehavior();
        if (!hpa?.setMoveTarget) throw new Error(`Ground nav behavior missing setMoveTarget: ${HPA_GROUND_NAV_BEHAVIOR_ID}`);
        const grid = state.obstacleGrid;
        const { col, row } = grid.worldToGrid(seeker.x, seeker.y);
        snakeBrain.brain.stampArrival(col, row);
        const cell = resolveExploreCell(state, col, row, snakeBrain.brain.spatial, rng);
        if (!cell) return;
        const key = cavernCellKey(cell.col, cell.row);
        if (mode === "explore" && exploreCellKey === key && hpa.hasMoveTarget?.(seeker)) return;
        directBehavior()?.clearMoveTarget?.(seeker);
        mode = "explore";
        trackedGoalId = null;
        exploreCellKey = key;
        meta.setActiveBehaviorId(seeker.id, HPA_GROUND_NAV_BEHAVIOR_ID);
        hpa.setMoveTarget(seeker, grid.gridToWorld(cell.col, cell.row));
    };
    const refreshIntent = (seeker) => {
        const goal = resolveSeekGoal(seeker);
        if (goal) {
            enterSeek(seeker, goal);
            return;
        }
        if (mode === "seek") {
            clearNavTargets(seeker);
            mode = "explore";
            trackedGoalId = null;
            exploreCellKey = null;
        }
        const hpa = hpaBehavior();
        if (!exploreCellKey || !hpa?.hasMoveTarget?.(seeker)) enterExplore(seeker);
    };
    return {
        start() {
            active = true;
            mode = "explore";
            trackedGoalId = null;
            exploreCellKey = null;
            snakeBrain.brain.clearMemory();
            const seeker = resolveSeeker();
            if (seeker) {
                syncBrain(seeker);
                refreshIntent(seeker);
            }
        },
        stop() {
            active = false;
            trackedGoalId = null;
            exploreCellKey = null;
            const seeker = resolveSeeker();
            if (seeker) clearNavTargets(seeker);
        },
        isActive() {
            return active;
        },
        getMode() {
            return mode;
        },
        getBrain() {
            return snakeBrain.brain;
        },
        tick(dt) {
            if (!active) return;
            const seeker = resolveSeeker();
            if (!seeker || seeker.isDead) return;
            syncBrain(seeker);
            const goal = resolveSeekGoal(seeker);
            if (goal) {
                enterSeek(seeker, goal);
                const dist = Math.hypot(goal.x - seeker.x, goal.y - seeker.y);
                const radius = typeof resolvedEatRadius === "function" ? resolvedEatRadius() : resolvedEatRadius;
                if (dist <= radius) {
                    const grid = state.obstacleGrid;
                    const goalCell = grid.worldToGrid(goal.x, goal.y);
                    snakeBrain.brain.stampArrival(goalCell.col, goalCell.row);
                    removeSandboxWorldProp(state, goal);
                    if (pinnedGoalId === goal.id) pinnedGoalId = null;
                    trackedGoalId = null;
                    clearNavTargets(seeker);
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
                    refreshIntent(seeker);
                } else if (goal.id !== trackedGoalId) enterSeek(seeker, goal);
                else if (!hpaBehavior()?.hasMoveTarget?.(seeker)) enterSeek(seeker, goal);
                return;
            }
            refreshIntent(seeker);
        },
    };
}
