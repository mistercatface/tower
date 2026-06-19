import { DIRECT_GROUND_NAV_BEHAVIOR_ID, HPA_GROUND_NAV_BEHAVIOR_ID } from "../../Sandbox/groundNav/groundNavIds.js";
export function createSeekExploreIntent({
    brain,
    sync,
    behaviorById,
    setActiveBehaviorId,
    resolveVisibleGoal,
    resolveExploreCell,
    navBehaviorId = HPA_GROUND_NAV_BEHAVIOR_ID,
    directBehaviorId = DIRECT_GROUND_NAV_BEHAVIOR_ID,
    rng = Math.random,
}) {
    if (!behaviorById.get(navBehaviorId)) throw new Error(`Seek/explore intent missing behavior: ${navBehaviorId}`);
    if (!behaviorById.get(directBehaviorId)) throw new Error(`Seek/explore intent missing behavior: ${directBehaviorId}`);
    const navBehavior = () => behaviorById.get(navBehaviorId);
    const directBehavior = () => behaviorById.get(directBehaviorId);
    let mode = "explore";
    let trackedGoalId = null;
    let exploreCellKey = null;
    const clearNavTargets = (seeker) => {
        navBehavior().clearMoveTarget(seeker);
        directBehavior().clearMoveTarget(seeker);
    };
    const enterSeek = (seeker, goal, state) => {
        const nav = navBehavior();
        if (mode === "seek" && trackedGoalId === goal.id && nav.hasMoveTarget(seeker)) return;
        directBehavior().clearMoveTarget(seeker);
        mode = "seek";
        trackedGoalId = goal.id;
        exploreCellKey = null;
        setActiveBehaviorId(seeker.id, navBehaviorId);
        nav.setMoveTarget(seeker, { x: goal.x, y: goal.y });
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
        trackedGoalId = null;
        exploreCellKey = key;
        setActiveBehaviorId(seeker.id, navBehaviorId);
        nav.setMoveTarget(seeker, grid.gridToWorld(cell.col, cell.row));
    };
    const refresh = (seeker, state) => {
        const goal = resolveVisibleGoal(seeker, state);
        if (goal) {
            enterSeek(seeker, goal, state);
            return goal;
        }
        if (mode === "seek") {
            clearNavTargets(seeker);
            mode = "explore";
            trackedGoalId = null;
            exploreCellKey = null;
        }
        const nav = navBehavior();
        if (!exploreCellKey || !nav.hasMoveTarget(seeker)) enterExplore(seeker, state);
        return null;
    };
    return {
        sync(seeker, state) {
            sync(seeker, state);
        },
        refresh,
        enterSeek,
        enterExplore,
        clear(seeker) {
            trackedGoalId = null;
            exploreCellKey = null;
            clearNavTargets(seeker);
            seeker.navStepPenalty = null;
        },
        resetMemory() {
            brain.clearMemory();
        },
        resetMode() {
            mode = "explore";
            trackedGoalId = null;
            exploreCellKey = null;
        },
        getMode() {
            return mode;
        },
        getTrackedGoalId() {
            return trackedGoalId;
        },
        clearTrackedGoal() {
            trackedGoalId = null;
        },
        hasMoveTarget(seeker) {
            return navBehavior().hasMoveTarget(seeker);
        },
        navBehavior,
    };
}
