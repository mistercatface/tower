export function createAgentIntent({
    brain,
    sync,
    perceiveWorld,
    pickPolicy,
    transitionReason,
    resolveExploreCell,
    resolveFleeCell,
    locomotion,
    seekMode = "seek",
    fleeMode = "flee",
    exploreMode = "explore",
    rng = Math.random,
    resolveCommitTarget = (state, id, world) => {
        const prop = state.entityRegistry.getLive(id);
        if (!prop || prop.isDead) return null;
        return prop;
    },
}) {
    let mode = exploreMode;
    let targetId = null;
    let lastArrivalCol = null;
    let lastArrivalRow = null;
    let lastTransitionReason = "init";
    const resolveCommittedTarget = (state, world = null) => {
        if (targetId == null) return null;
        return resolveCommitTarget(state, targetId, world);
    };
    const stampArrivalOnCellEnter = (agent, grid) => {
        const { col, row } = grid.worldToGrid(agent.x, agent.y);
        if (col === lastArrivalCol && row === lastArrivalRow) return;
        lastArrivalCol = col;
        lastArrivalRow = row;
        brain.stampArrival(col, row);
    };
    const setFleeDestination = (agent, state, avoidCell = null) => {
        const world = perceiveWorld(agent, state);
        const threat = world.threat;
        if (!threat) return null;
        const cell = resolveFleeCell(agent, threat, state, avoidCell);
        if (cell) locomotion.setFlee(agent, state, cell);
        return cell;
    };
    const setDestinationForCommit = (agent, state, world = null) => {
        if (mode === exploreMode) {
            const cell = resolveExploreCell(agent, state, brain.spatial, rng);
            if (cell) locomotion.setExplore(agent, state, cell);
            return;
        }
        if (mode === fleeMode) {
            setFleeDestination(agent, state);
            return;
        }
        const perceived = world ?? perceiveWorld(agent, state);
        const target = resolveCommittedTarget(state, perceived);
        if (target) locomotion.setSeek(agent, state, target);
    };
    const commit = (agent, state, nextMode, nextTargetId, reason, world = null) => {
        mode = nextMode;
        targetId = nextTargetId;
        lastTransitionReason = reason;
        locomotion.clearDestination(agent, state);
        setDestinationForCommit(agent, state, world);
    };
    const perceive = (agent, state) => {
        sync(agent, state);
        stampArrivalOnCellEnter(agent, state.obstacleGrid);
    };
    const transition = (agent, state) => {
        const grid = state.obstacleGrid;
        const world = perceiveWorld(agent, state);
        const policy = pickPolicy(world);
        if (mode === seekMode && !resolveCommittedTarget(state, world)) {
            commit(agent, state, policy.mode, policy.targetId, "target_lost", world);
            return { mode, target: resolveCommittedTarget(state, world) };
        }
        if (policy.mode !== mode || policy.targetId !== targetId) {
            commit(agent, state, policy.mode, policy.targetId, transitionReason(mode, policy.mode), world);
            return { mode, target: resolveCommittedTarget(state, world) };
        }
        if (locomotion.getDestination() && locomotion.needsRetry(agent, state)) {
            lastTransitionReason = "route_failed_retry";
            const status = locomotion.getStatus(agent, state);
            if (!status.replanPending && locomotion.retryOnRouteFailure(mode, { seekMode, fleeMode, exploreMode })) setDestinationForCommit(agent, state, world);
            return { mode, target: resolveCommittedTarget(state, world) };
        }
        const dest = locomotion.getDestination();
        const target = resolveCommittedTarget(state, world);
        if (mode === seekMode) {
            if (!target) {
                commit(agent, state, policy.mode, policy.targetId, "target_lost", world);
                return { mode, target: null };
            }
            const targetCell = grid.worldToGrid(target.x, target.y);
            if (!dest || locomotion.hasArrivedAtDest(agent, grid) || dest.col !== targetCell.col || dest.row !== targetCell.row) {
                lastTransitionReason = locomotion.hasArrivedAtDest(agent, grid) ? "arrived" : "repick_dest";
                setDestinationForCommit(agent, state, world);
                return { mode, target };
            }
            lastTransitionReason = "held_latch";
            return { mode, target };
        }
        if (mode === fleeMode) {
            if (!dest) {
                lastTransitionReason = "repick_dest";
                setFleeDestination(agent, state);
                return { mode, target: null };
            }
            if (locomotion.hasReachedDest(agent, grid) && world.threat) {
                const nextCell = setFleeDestination(agent, state, dest);
                lastTransitionReason = nextCell && (nextCell.col !== dest.col || nextCell.row !== dest.row) ? "flee_continue" : "held_latch";
                return { mode, target: null };
            }
            lastTransitionReason = "held_latch";
            return { mode, target: null };
        }
        if (!dest || locomotion.hasArrivedAtDest(agent, grid)) {
            lastTransitionReason = locomotion.hasArrivedAtDest(agent, grid) ? "arrived" : "repick_dest";
            setDestinationForCommit(agent, state, world);
            return { mode, target: null };
        }
        lastTransitionReason = "held_latch";
        return { mode, target: null };
    };
    return {
        perceive,
        transition,
        refresh(agent, state) {
            perceive(agent, state);
            transition(agent, state);
            const world = perceiveWorld(agent, state);
            return resolveCommittedTarget(state, world);
        },
        clear(agent, state) {
            lastArrivalCol = null;
            lastArrivalRow = null;
            lastTransitionReason = "cleared";
            targetId = null;
            locomotion.clear(agent, state);
            agent.navStepPenalty = null;
        },
        resetMemory() {
            brain.clearMemory();
        },
        resetMode(agent, state, { clearLocomotion = true } = {}) {
            mode = exploreMode;
            targetId = null;
            lastArrivalCol = null;
            lastArrivalRow = null;
            lastTransitionReason = "reset";
            if (clearLocomotion) locomotion.clearDestination(agent, state);
        },
        holdSeek(agent, state, target) {
            if (mode === seekMode && targetId === target.id && locomotion.hasMoveTarget(agent, state)) return;
            mode = seekMode;
            targetId = target.id;
            lastTransitionReason = "mode_seek";
            locomotion.setSeek(agent, state, target);
        },
        holdExplore(agent, state) {
            const grid = state.obstacleGrid;
            const { col, row } = grid.worldToGrid(agent.x, agent.y);
            brain.stampArrival(col, row);
            const cell = resolveExploreCell(agent, state, brain.spatial, rng);
            if (!cell) return;
            const dest = locomotion.getDestination();
            if (mode === exploreMode && dest && dest.col === cell.col && dest.row === cell.row && locomotion.hasMoveTarget(agent, state)) return;
            mode = exploreMode;
            targetId = null;
            lastTransitionReason = "mode_explore";
            locomotion.setExplore(agent, state, cell);
        },
        getMode() {
            return mode;
        },
        getTargetId() {
            return targetId;
        },
        getTrackedGoalId() {
            return targetId;
        },
        clearTrackedGoal() {
            targetId = null;
        },
        getDestination() {
            return locomotion.getDestination();
        },
        getLastTransitionReason() {
            return lastTransitionReason;
        },
        getLocomotionStatus(agent, state) {
            return locomotion.getStatus(agent, state);
        },
        getFsmSnapshot(agent, state) {
            const loco = locomotion.getStatus(agent, state);
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
                vx: agent.vx,
                vy: agent.vy,
                lastTransition: lastTransitionReason,
            };
        },
        hasMoveTarget(agent, state) {
            return locomotion.hasMoveTarget(agent, state);
        },
        locomotion,
    };
}
