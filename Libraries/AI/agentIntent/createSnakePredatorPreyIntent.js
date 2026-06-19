import { DIRECT_GROUND_NAV_BEHAVIOR_ID, HPA_GROUND_NAV_BEHAVIOR_ID } from "../../Sandbox/groundNav/groundNavIds.js";
import { createSnakeLocomotion } from "../../Game/snake/snakeLocomotion.js";
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
    const locomotion = createSnakeLocomotion(navBehavior, directBehavior, setActiveBehaviorId, navBehaviorId);
    const resolvedVision = visionCone ?? getSnakeGameConfig().visionCone;
    let mode = "explore";
    let trackedTargetId = null;
    let fleeThreatAnchor = null;
    const destMatches = (col, row) => {
        const dest = locomotion.getDestination();
        return dest && dest.col === col && dest.row === row;
    };
    const enterSeekTarget = (seeker, nextMode, target, state) => {
        const grid = state.obstacleGrid;
        const cell = grid.worldToGrid(target.x, target.y);
        if (mode === nextMode && trackedTargetId === target.id && destMatches(cell.col, cell.row) && !locomotion.needsRetry(seeker)) return;
        mode = nextMode;
        trackedTargetId = target.id;
        locomotion.setDestinationFromWorld(grid, target);
    };
    const enterFlee = (seeker, threat, state) => {
        const config = getSnakeGameConfig();
        const grid = state.obstacleGrid;
        const threatCell = grid.worldToGrid(threat.x, threat.y);
        const threatAnchor = `${threat.id}:${threatCell.col},${threatCell.row}`;
        if (mode === "flee" && trackedTargetId === threat.id && fleeThreatAnchor === threatAnchor && !locomotion.needsRetry(seeker)) return;
        const fleeTarget = resolveFleeNavTarget(seeker, threat, config.fleeMinDistance, state);
        brain.stampArrival(threatCell.col, threatCell.row);
        const fleeCell = grid.worldToGrid(fleeTarget.x, fleeTarget.y);
        brain.stampArrival(fleeCell.col, fleeCell.row);
        mode = "flee";
        trackedTargetId = threat.id;
        fleeThreatAnchor = threatAnchor;
        locomotion.setDestinationFromWorld(grid, fleeTarget);
    };
    const enterExplore = (seeker, state) => {
        const grid = state.obstacleGrid;
        const { col, row } = grid.worldToGrid(seeker.x, seeker.y);
        brain.stampArrival(col, row);
        const cell = resolveExploreCell(seeker, state, brain.spatial, rng);
        if (!cell) return;
        if (mode === "explore" && destMatches(cell.col, cell.row) && !locomotion.needsRetry(seeker)) return;
        mode = "explore";
        trackedTargetId = null;
        locomotion.setDestination(grid, cell.col, cell.row);
    };
    const refresh = (seeker, state) => {
        const choice = pickSnakeIntentTarget(seeker, selfHeadId, state, registry, resolveVisibleFood, resolvedVision);
        if (choice.mode === "flee") {
            enterFlee(seeker, choice.target, state);
            locomotion.applyToNav(seeker, state);
            return choice;
        }
        if (choice.mode === "seek_food" || choice.mode === "seek_prey") {
            enterSeekTarget(seeker, choice.mode, choice.target, state);
            locomotion.applyToNav(seeker, state);
            return choice;
        }
        if (mode === "seek_food" || mode === "seek_prey" || mode === "flee") {
            locomotion.clearDestination();
            mode = "explore";
            trackedTargetId = null;
            fleeThreatAnchor = null;
        }
        if (!locomotion.getDestination() || locomotion.needsRetry(seeker)) enterExplore(seeker, state);
        locomotion.applyToNav(seeker, state);
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
        clear(seeker, state) {
            trackedTargetId = null;
            locomotion.clearDestination();
            locomotion.applyToNav(seeker, state);
            seeker.navStepPenalty = null;
        },
        resetMemory() {
            brain.clearMemory();
        },
        resetMode() {
            mode = "explore";
            trackedTargetId = null;
            fleeThreatAnchor = null;
            locomotion.clearDestination();
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
        getDestination() {
            return locomotion.getDestination();
        },
        getLocomotionStatus(seeker, state) {
            return locomotion.getStatus(seeker, state);
        },
        hasMoveTarget(seeker) {
            return locomotion.getDestination() != null && navBehavior().hasMoveTarget(seeker);
        },
        navBehavior,
        locomotion,
    };
}
