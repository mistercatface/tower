import { DIRECT_GROUND_NAV_BEHAVIOR_ID, HPA_GROUND_NAV_BEHAVIOR_ID } from "../../Sandbox/groundNav/groundNavIds.js";
import { getSnakeGameConfig } from "../../Game/snake/snakeGameConfig.js";
import { pickSnakeIntentTarget, resolveFleeNavTarget } from "../../Game/snake/snakePredatorPrey.js";
export function createSnakePredatorPreyIntent({
    brain,
    sync,
    behaviorById,
    setActiveBehaviorId,
    resolveVisibleFood,
    resolveExploreCell,
    selfHeadId,
    registry,
    navBehaviorId = HPA_GROUND_NAV_BEHAVIOR_ID,
    directBehaviorId = DIRECT_GROUND_NAV_BEHAVIOR_ID,
    visionCone = null,
    rng = Math.random,
}) {
    if (!behaviorById.get(navBehaviorId)) throw new Error(`Snake intent missing behavior: ${navBehaviorId}`);
    if (!behaviorById.get(directBehaviorId)) throw new Error(`Snake intent missing behavior: ${directBehaviorId}`);
    const navBehavior = () => behaviorById.get(navBehaviorId);
    const directBehavior = () => behaviorById.get(directBehaviorId);
    const resolvedVision = visionCone ?? getSnakeGameConfig().visionCone;
    let mode = "explore";
    let trackedTargetId = null;
    let exploreCellKey = null;
    let navAnchorKey = null;
    const clearNavTargets = (seeker) => {
        navBehavior().clearMoveTarget(seeker);
        directBehavior().clearMoveTarget(seeker);
    };
    const enterSeekTarget = (seeker, nextMode, target, state) => {
        const nav = navBehavior();
        const grid = state.obstacleGrid;
        const cell = grid.worldToGrid(target.x, target.y);
        const anchorKey = `${nextMode}:${target.id}:${cell.col},${cell.row}`;
        if (mode === nextMode && trackedTargetId === target.id && navAnchorKey === anchorKey && nav.hasMoveTarget(seeker)) return;
        directBehavior().clearMoveTarget(seeker);
        mode = nextMode;
        trackedTargetId = target.id;
        exploreCellKey = null;
        navAnchorKey = anchorKey;
        setActiveBehaviorId(seeker.id, navBehaviorId);
        nav.setMoveTarget(seeker, { x: target.x, y: target.y });
    };
    const enterFlee = (seeker, threat, state) => {
        const config = getSnakeGameConfig();
        const nav = navBehavior();
        const grid = state.obstacleGrid;
        const threatCell = grid.worldToGrid(threat.x, threat.y);
        const anchorKey = `flee:${threat.id}:${threatCell.col},${threatCell.row}`;
        if (mode === "flee" && trackedTargetId === threat.id && navAnchorKey === anchorKey && nav.hasMoveTarget(seeker)) return;
        const fleeTarget = resolveFleeNavTarget(seeker, threat, config.fleeMinDistance, state);
        brain.stampArrival(threatCell.col, threatCell.row);
        const fleeCell = grid.worldToGrid(fleeTarget.x, fleeTarget.y);
        brain.stampArrival(fleeCell.col, fleeCell.row);
        directBehavior().clearMoveTarget(seeker);
        mode = "flee";
        trackedTargetId = threat.id;
        exploreCellKey = null;
        navAnchorKey = anchorKey;
        setActiveBehaviorId(seeker.id, navBehaviorId);
        nav.setMoveTarget(seeker, fleeTarget);
    };
    const enterExplore = (seeker, state) => {
        const nav = navBehavior();
        const grid = state.obstacleGrid;
        const { col, row } = grid.worldToGrid(seeker.x, seeker.y);
        brain.stampArrival(col, row);
        const cell = resolveExploreCell(seeker, state, brain.spatial, rng);
        if (!cell) return;
        const key = `${cell.col},${cell.row}`;
        if (mode === "explore" && exploreCellKey === key && nav.hasMoveTarget(seeker)) return;
        directBehavior().clearMoveTarget(seeker);
        mode = "explore";
        trackedTargetId = null;
        exploreCellKey = key;
        setActiveBehaviorId(seeker.id, navBehaviorId);
        nav.setMoveTarget(seeker, grid.gridToWorld(cell.col, cell.row));
    };
    const refresh = (seeker, state) => {
        const choice = pickSnakeIntentTarget(seeker, selfHeadId, state, registry, resolveVisibleFood, resolvedVision);
        if (choice.mode === "flee") {
            enterFlee(seeker, choice.target, state);
            return choice;
        }
        if (choice.mode === "seek_food" || choice.mode === "seek_prey") {
            enterSeekTarget(seeker, choice.mode, choice.target, state);
            return choice;
        }
        if (mode === "seek_food" || mode === "seek_prey" || mode === "flee") {
            clearNavTargets(seeker);
            mode = "explore";
            trackedTargetId = null;
            exploreCellKey = null;
            navAnchorKey = null;
        }
        const nav = navBehavior();
        if (!exploreCellKey || !nav.hasMoveTarget(seeker)) enterExplore(seeker, state);
        return choice;
    };
    return {
        sync(seeker, state) {
            sync(seeker, state);
        },
        refresh,
        enterSeekTarget,
        enterFlee,
        enterExplore,
        clear(seeker) {
            trackedTargetId = null;
            exploreCellKey = null;
            clearNavTargets(seeker);
            seeker.navStepPenalty = null;
        },
        resetMemory() {
            brain.clearMemory();
        },
        resetMode() {
            mode = "explore";
            trackedTargetId = null;
            exploreCellKey = null;
            navAnchorKey = null;
        },
        getMode() {
            return mode;
        },
        getTrackedTargetId() {
            return trackedTargetId;
        },
        clearTrackedTarget() {
            trackedTargetId = null;
        },
        hasMoveTarget(seeker) {
            return navBehavior().hasMoveTarget(seeker);
        },
        navBehavior,
    };
}
