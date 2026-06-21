export function createExploreIntentState() {
    return {
        enter(ctx) {
            ctx.effects.setExploreDestination();
        },
        update(ctx) {
            if (!ctx.dest || ctx.locomotion.hasArrivedAtDest(ctx.agent, ctx.grid)) {
                ctx.effects.setLastTransition(ctx.locomotion.hasArrivedAtDest(ctx.agent, ctx.grid) ? "arrived" : "repick_dest");
                ctx.effects.setExploreDestination();
                return;
            }
            ctx.effects.holdDestination();
        },
    };
}
export function createSeekIntentState() {
    return {
        enter(ctx) {
            ctx.effects.setSeekDestination(ctx.target);
        },
        update(ctx) {
            if (!ctx.target) {
                ctx.effects.transitionTo(ctx.policy.mode, "target_lost", ctx.policy.targetId);
                return;
            }
            const targetCell = ctx.grid.worldToGrid(ctx.target.x, ctx.target.y);
            const targetMovedInCell = ctx.dest?.lockOnTarget && ctx.dest.world && (ctx.dest.world.x !== ctx.target.x || ctx.dest.world.y !== ctx.target.y);
            if (!ctx.dest || ctx.locomotion.hasArrivedAtDest(ctx.agent, ctx.grid) || ctx.dest.col !== targetCell.col || ctx.dest.row !== targetCell.row || targetMovedInCell) {
                ctx.effects.setLastTransition(ctx.locomotion.hasArrivedAtDest(ctx.agent, ctx.grid) ? "arrived" : "repick_dest");
                ctx.effects.setSeekDestination(ctx.target);
                return;
            }
            ctx.effects.holdDestination();
        },
    };
}
export function createFleeIntentState() {
    return {
        enter(ctx) {
            ctx.effects.setFleeDestination(null);
        },
        update(ctx) {
            if (!ctx.dest) {
                ctx.effects.setLastTransition("repick_dest");
                ctx.effects.setFleeDestination(null);
                return;
            }
            if (ctx.locomotion.hasReachedDest(ctx.agent, ctx.grid) && ctx.fleeTarget) {
                const nextCell = ctx.effects.setFleeDestination(ctx.dest);
                ctx.effects.setLastTransition(nextCell && (nextCell.col !== ctx.dest.col || nextCell.row !== ctx.dest.row) ? "flee_continue" : "held_latch");
                return;
            }
            ctx.effects.holdDestination();
        },
    };
}
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
    seekModes = null,
    fleeMode = "flee",
    exploreMode = "explore",
    seekArrivalRadius = null,
    rng = Math.random,
    states = null,
    modeExitDelayTicks = {},
    resolveFleeTarget = (world) => world.fleeTarget,
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
    let ticks = 0;
    let lastModeChangeTick = 0;
    const seekModeSet = new Set(seekModes ?? [seekMode]);
    const isSeekMode = (value) => seekModeSet.has(value);
    const stateByMode = states ?? {
        [exploreMode]: createExploreIntentState(),
        [fleeMode]: createFleeIntentState(),
        ...Object.fromEntries([...seekModeSet].map((value) => [value, createSeekIntentState()])),
    };
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
    const setFleeDestination = (agent, state, avoidCell = null, world = null) => {
        const perceived = world ?? perceiveWorld(agent, state);
        const fleeTarget = resolveFleeTarget(perceived);
        if (!fleeTarget) return null;
        const cell = resolveFleeCell(agent, fleeTarget, state, avoidCell);
        if (cell) locomotion.setFlee(agent, state, cell);
        return cell;
    };
    const setExploreDestination = (agent, state) => {
        const cell = resolveExploreCell(agent, state, brain.spatial, rng);
        if (cell) locomotion.setExplore(agent, state, cell);
        return cell;
    };
    const setSeekDestination = (agent, state, target) => {
        if (!target) return;
        const seekOptions = typeof seekArrivalRadius === "function" ? seekArrivalRadius(mode, agent, target, state) : seekArrivalRadius;
        locomotion.setSeek(agent, state, target, typeof seekOptions === "object" && seekOptions !== null ? seekOptions : { arrivalRadius: seekOptions });
    };
    const makeContext = (agent, state, world, policy) => {
        const effects = {
            transitionTo(nextMode, reason, nextTargetId = null) {
                commit(agent, state, nextMode, nextTargetId, reason, world);
            },
            setExploreDestination() {
                return setExploreDestination(agent, state);
            },
            setSeekDestination(target) {
                setSeekDestination(agent, state, target);
            },
            setFleeDestination(avoidCell = null) {
                return setFleeDestination(agent, state, avoidCell, world);
            },
            setLastTransition(reason) {
                lastTransitionReason = reason;
            },
            holdDestination(reason = "held_latch") {
                lastTransitionReason = reason;
            },
        };
        return {
            agent,
            state,
            grid: state.obstacleGrid,
            world,
            policy,
            mode,
            targetId,
            dest: locomotion.getDestination(),
            target: resolveCommittedTarget(state, world),
            fleeTarget: resolveFleeTarget(world),
            ticks,
            lastModeChangeTick,
            locomotion,
            effects,
        };
    };
    const enterCurrentState = (agent, state, world, policy) => {
        const current = stateByMode[mode];
        if (current?.enter) current.enter(makeContext(agent, state, world, policy));
    };
    const commit = (agent, state, nextMode, nextTargetId, reason, world = null) => {
        const prevMode = mode;
        mode = nextMode;
        targetId = nextTargetId;
        lastTransitionReason = reason;
        if (prevMode !== nextMode) lastModeChangeTick = ticks;
        locomotion.clearDestination(agent, state);
        enterCurrentState(agent, state, world ?? perceiveWorld(agent, state), { mode: nextMode, targetId: nextTargetId });
    };
    const perceive = (agent, state) => {
        sync(agent, state);
        stampArrivalOnCellEnter(agent, state.obstacleGrid);
    };
    const chooseTransition = (agent, state, world, policy) => {
        if (isSeekMode(mode) && !resolveCommittedTarget(state, world)) {
            commit(agent, state, policy.mode, policy.targetId, "target_lost", world);
            return true;
        }
        if (policy.mode === mode && policy.targetId === targetId) return false;
        const exitDelayTicks = modeExitDelayTicks[mode] ?? 0;
        if (policy.mode !== mode && ticks - lastModeChangeTick < exitDelayTicks) return false;
        commit(agent, state, policy.mode, policy.targetId, policy.reason ?? transitionReason(mode, policy.mode, policy, world), world);
        return true;
    };
    const retryRouteFailure = (agent, state, world, policy) => {
        if (!locomotion.getDestination() || !locomotion.needsRetry(agent, state)) return false;
        lastTransitionReason = "route_failed_retry";
        const status = locomotion.getStatus(agent, state);
        if (!status.replanPending && locomotion.retryOnRouteFailure(mode, { seekMode, seekModes: seekModeSet, fleeMode, exploreMode })) enterCurrentState(agent, state, world, policy);
        return true;
    };
    const transition = (agent, state) => {
        ticks++;
        const world = perceiveWorld(agent, state);
        const policy = { ...pickPolicy(world) };
        if (chooseTransition(agent, state, world, policy)) return { mode, target: resolveCommittedTarget(state, world) };
        if (retryRouteFailure(agent, state, world, policy)) return { mode, target: resolveCommittedTarget(state, world) };
        const current = stateByMode[mode];
        if (current?.update) current.update(makeContext(agent, state, world, policy));
        return { mode, target: resolveCommittedTarget(state, world) };
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
            if (agent) agent.navStepPenalty = null;
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
            ticks = 0;
            lastModeChangeTick = 0;
            if (clearLocomotion) locomotion.clearDestination(agent, state);
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
