import { cellChebyshevDistance } from "../../Navigation/steering/exploreSteering.js";
import { getSnakeGameConfig } from "../../Game/snake/snakeGameConfig.js";
import { perceiveSnakeIntentWorld, pickRetreatDestination, pickSnakeIntentPolicy } from "../../Game/snake/snakePredatorPrey.js";
export function createSnakePredatorPreyIntent({ brain, sync, headNav, resolveVisibleFood, resolveExploreCell, selfHeadId, registry, navWalkable, visionCone = null, rng = Math.random }) {
    const resolvedVision = visionCone ?? getSnakeGameConfig().visionCone;
    const fleeThreatClearTicks = getSnakeGameConfig().fleeThreatClearTicks;
    let mode = "explore";
    let targetId = null;
    let threatClearTicks = 0;
    let lastArrivalCol = null;
    let lastArrivalRow = null;
    let lastTransitionReason = "init";
    const resolveCommittedTarget = (state) => {
        if (targetId == null) return null;
        if (mode === "seek_prey" && !registry.aliveByHeadId.has(targetId)) return null;
        const prop = state.entityRegistry.getLive(targetId);
        if (!prop || prop.isDead) return null;
        return prop;
    };
    const stampArrivalOnCellEnter = (seeker, grid) => {
        const { col, row } = grid.worldToGrid(seeker.x, seeker.y);
        if (col === lastArrivalCol && row === lastArrivalRow) return;
        lastArrivalCol = col;
        lastArrivalRow = row;
        brain.stampArrival(col, row);
    };
    const hasArrivedAtDest = (seeker, grid) => {
        const dest = headNav.getDestination();
        if (!dest) return false;
        const { col, row } = grid.worldToGrid(seeker.x, seeker.y);
        return cellChebyshevDistance(col, row, dest.col, dest.row) <= 1;
    };
    const setDestinationForCommit = (seeker, state) => {
        const grid = state.obstacleGrid;
        if (mode === "explore") {
            const cell = resolveExploreCell(seeker, state, brain.spatial, rng);
            if (cell) headNav.setDestination(grid, cell.col, cell.row);
            return;
        }
        if (mode === "flee") {
            const cell = pickRetreatDestination(seeker, state, registry, selfHeadId, brain.spatial, rng, navWalkable, resolvedVision);
            if (cell) headNav.setDestination(grid, cell.col, cell.row);
            return;
        }
        const target = resolveCommittedTarget(state);
        if (target) {
            const cell = grid.worldToGrid(target.x, target.y);
            headNav.setDestination(grid, cell.col, cell.row);
        }
    };
    const commit = (seeker, state, nextMode, nextTargetId, reason) => {
        mode = nextMode;
        targetId = nextTargetId;
        lastTransitionReason = reason;
        headNav.clearDestination();
        setDestinationForCommit(seeker, state);
    };
    const resolvePolicyMode = (rawMode) => {
        if (mode === "flee" && rawMode !== "flee") {
            threatClearTicks++;
            if (threatClearTicks < fleeThreatClearTicks) return "flee";
            return rawMode;
        }
        if (rawMode === "flee") threatClearTicks = 0;
        else if (mode !== "flee") threatClearTicks = 0;
        return rawMode;
    };
    const transitionReason = (prevMode, nextMode) => {
        if (nextMode === "flee") return "threat_entered";
        if (prevMode === "flee") return "threat_cleared";
        if ((prevMode === "seek_prey" || prevMode === "seek_food") && nextMode !== prevMode) return "target_lost";
        return `mode_${nextMode}`;
    };
    const perceive = (seeker, state) => {
        sync(seeker, state);
        stampArrivalOnCellEnter(seeker, state.obstacleGrid);
    };
    const transition = (seeker, state) => {
        const grid = state.obstacleGrid;
        const world = perceiveSnakeIntentWorld(seeker, selfHeadId, state, registry, resolveVisibleFood, resolvedVision);
        const rawPolicy = pickSnakeIntentPolicy(world, seeker);
        const policyMode = resolvePolicyMode(rawPolicy.mode);
        const policy = { mode: policyMode, targetId: policyMode === "flee" ? null : rawPolicy.targetId };
        if ((mode === "seek_prey" || mode === "seek_food") && !resolveCommittedTarget(state)) {
            commit(seeker, state, policy.mode, policy.targetId, "target_lost");
            return { mode, target: resolveCommittedTarget(state) };
        }
        if (policy.mode !== mode || policy.targetId !== targetId) {
            commit(seeker, state, policy.mode, policy.targetId, transitionReason(mode, policy.mode));
            return { mode, target: resolveCommittedTarget(state) };
        }
        if (headNav.getDestination() && headNav.needsRetry()) {
            lastTransitionReason = "route_failed_retry";
            return { mode, target: resolveCommittedTarget(state) };
        }
        const dest = headNav.getDestination();
        const target = resolveCommittedTarget(state);
        if (mode === "seek_food" || mode === "seek_prey") {
            if (!target) {
                commit(seeker, state, policy.mode, policy.targetId, "target_lost");
                return { mode, target: null };
            }
            const targetCell = grid.worldToGrid(target.x, target.y);
            if (!dest || hasArrivedAtDest(seeker, grid) || dest.col !== targetCell.col || dest.row !== targetCell.row) {
                lastTransitionReason = hasArrivedAtDest(seeker, grid) ? "arrived" : "repick_dest";
                setDestinationForCommit(seeker, state);
                return { mode, target };
            }
            lastTransitionReason = "held_latch";
            return { mode, target };
        }
        if (!dest || hasArrivedAtDest(seeker, grid)) {
            lastTransitionReason = hasArrivedAtDest(seeker, grid) ? "arrived" : "repick_dest";
            setDestinationForCommit(seeker, state);
            return { mode, target: null };
        }
        lastTransitionReason = "held_latch";
        return { mode, target: null };
    };
    return {
        perceive,
        transition,
        onSnakeDied(deadHeadId) {
            if (targetId !== deadHeadId) return;
            mode = "explore";
            targetId = null;
            threatClearTicks = 0;
            lastTransitionReason = "target_died";
            headNav.clearDestination();
        },
        clear(seeker, state) {
            threatClearTicks = 0;
            lastArrivalCol = null;
            lastArrivalRow = null;
            lastTransitionReason = "cleared";
            targetId = null;
            headNav.clear(seeker);
            seeker.navStepPenalty = null;
        },
        resetMemory() {
            brain.clearMemory();
        },
        resetMode() {
            mode = "explore";
            targetId = null;
            threatClearTicks = 0;
            lastArrivalCol = null;
            lastArrivalRow = null;
            lastTransitionReason = "reset";
            headNav.clearDestination();
        },
        getMode() {
            return mode;
        },
        getTargetId() {
            return targetId;
        },
        getDestination() {
            return headNav.getDestination();
        },
        getLastTransitionReason() {
            return lastTransitionReason;
        },
        getLocomotionStatus() {
            return headNav.getStatus();
        },
        getFsmSnapshot(seeker, state) {
            const loco = headNav.getStatus();
            const dest = headNav.getDestination();
            let replanReason = null;
            if (loco.replanPending) replanReason = "pending";
            else if (dest && !loco.hasRoute) replanReason = "no_route";
            return {
                mode,
                destCell: dest ? { col: dest.col, row: dest.row } : null,
                pathLen: loco.pathLen,
                replanReason,
                stuckFrames: loco.stuckFrames,
                vx: seeker.vx,
                vy: seeker.vy,
                lastTransition: lastTransitionReason,
            };
        },
        hasMoveTarget() {
            const dest = headNav.getDestination();
            if (!dest) return false;
            const status = headNav.getStatus();
            return status.hasRoute || status.replanPending;
        },
        headNav,
    };
}
