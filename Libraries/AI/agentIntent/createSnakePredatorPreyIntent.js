import { DIRECT_GROUND_NAV_BEHAVIOR_ID, HPA_GROUND_NAV_BEHAVIOR_ID } from "../../Sandbox/groundNav/groundNavIds.js";
import { cellChebyshevDistance } from "../../Navigation/steering/exploreSteering.js";
import { createSnakeLocomotion } from "../../Game/snake/snakeLocomotion.js";
import { getSnakeGameConfig } from "../../Game/snake/snakeGameConfig.js";
import { pickSnakeIntentTarget, pickRetreatDestination } from "../../Game/snake/snakePredatorPrey.js";
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
    const fleeThreatClearTicks = getSnakeGameConfig().fleeThreatClearTicks;
    let mode = "explore";
    let threatClearTicks = 0;
    let lastArrivalCol = null;
    let lastArrivalRow = null;
    let lastTransitionReason = "init";
    const stampArrivalOnCellEnter = (seeker, grid) => {
        const { col, row } = grid.worldToGrid(seeker.x, seeker.y);
        if (col === lastArrivalCol && row === lastArrivalRow) return;
        lastArrivalCol = col;
        lastArrivalRow = row;
        brain.stampArrival(col, row);
    };
    const hasArrivedAtDest = (seeker, grid) => {
        const dest = locomotion.getDestination();
        if (!dest) return false;
        const { col, row } = grid.worldToGrid(seeker.x, seeker.y);
        return cellChebyshevDistance(col, row, dest.col, dest.row) <= 1;
    };
    const destinationStillValid = (seeker, grid, choice) => {
        const dest = locomotion.getDestination();
        if (!dest || hasArrivedAtDest(seeker, grid)) return false;
        if (mode === "seek_food" || mode === "seek_prey") {
            if (!choice.target) return false;
            const targetCell = grid.worldToGrid(choice.target.x, choice.target.y);
            return dest.col === targetCell.col && dest.row === targetCell.row;
        }
        return true;
    };
    const pickDestinationForMode = (seeker, state, choice) => {
        const grid = state.obstacleGrid;
        if (mode === "explore") {
            const cell = resolveExploreCell(seeker, state, brain.spatial, rng);
            if (cell) locomotion.setDestination(grid, cell.col, cell.row);
            return;
        }
        if (mode === "flee") {
            const cell = pickRetreatDestination(seeker, state, registry, selfHeadId, brain.spatial, rng, resolvedVision);
            if (cell) locomotion.setDestination(grid, cell.col, cell.row);
            return;
        }
        if ((mode === "seek_food" || mode === "seek_prey") && choice.target) {
            const cell = grid.worldToGrid(choice.target.x, choice.target.y);
            locomotion.setDestination(grid, cell.col, cell.row);
        }
    };
    const resolveEffectiveMode = (rawMode) => {
        if (mode === "flee" && rawMode !== "flee") {
            threatClearTicks++;
            if (threatClearTicks < fleeThreatClearTicks) return "flee";
            return rawMode;
        }
        if (rawMode === "flee") threatClearTicks = 0;
        else if (mode !== "flee") threatClearTicks = 0;
        return rawMode;
    };
    const perceive = (seeker, state) => {
        sync(seeker, state);
        stampArrivalOnCellEnter(seeker, state.obstacleGrid);
    };
    const transition = (seeker, state) => {
        const grid = state.obstacleGrid;
        const rawChoice = pickSnakeIntentTarget(seeker, selfHeadId, state, registry, resolveVisibleFood, resolvedVision);
        const nextMode = resolveEffectiveMode(rawChoice.mode);
        const prevMode = mode;
        if (nextMode !== mode) {
            mode = nextMode;
            if (nextMode === "flee") lastTransitionReason = "threat_entered";
            else if (prevMode === "flee") lastTransitionReason = "threat_cleared";
            else lastTransitionReason = `mode_${nextMode}`;
            pickDestinationForMode(seeker, state, rawChoice);
            return { mode, target: rawChoice.target };
        }
        if (locomotion.getDestination() && locomotion.needsRetry(seeker)) {
            lastTransitionReason = "route_failed_retry";
            return { mode, target: rawChoice.target };
        }
        if (destinationStillValid(seeker, grid, rawChoice)) {
            lastTransitionReason = "held_latch";
            return { mode, target: rawChoice.target };
        }
        lastTransitionReason = hasArrivedAtDest(seeker, grid) ? "arrived" : "repick_dest";
        pickDestinationForMode(seeker, state, rawChoice);
        return { mode, target: rawChoice.target };
    };
    return {
        perceive,
        transition,
        clear(seeker, state) {
            threatClearTicks = 0;
            lastArrivalCol = null;
            lastArrivalRow = null;
            lastTransitionReason = "cleared";
            locomotion.clearDestination();
            locomotion.tickNav(seeker, state);
            seeker.navStepPenalty = null;
        },
        resetMemory() {
            brain.clearMemory();
        },
        resetMode() {
            mode = "explore";
            threatClearTicks = 0;
            lastArrivalCol = null;
            lastArrivalRow = null;
            lastTransitionReason = "reset";
            locomotion.clearDestination();
        },
        getMode() {
            return mode;
        },
        getDestination() {
            return locomotion.getDestination();
        },
        getLastTransitionReason() {
            return lastTransitionReason;
        },
        getLocomotionStatus(seeker, state) {
            return locomotion.getStatus(seeker, state);
        },
        getFsmSnapshot(seeker, state) {
            const loco = locomotion.getStatus(seeker, state);
            const dest = locomotion.getDestination();
            let replanReason = null;
            if (loco.replanPending) replanReason = "pending";
            else if (dest && !loco.hasRoute) replanReason = "no_route";
            return {
                mode,
                destCell: dest ? { col: dest.col, row: dest.row } : null,
                pathLen: loco.pathLen,
                replanReason,
                stuckFrames: loco.stuckFrames,
                vx: seeker.vx ?? 0,
                vy: seeker.vy ?? 0,
                lastTransition: lastTransitionReason,
            };
        },
        hasMoveTarget(seeker) {
            return locomotion.getDestination() != null && navBehavior().hasMoveTarget(seeker);
        },
        locomotion,
    };
}
