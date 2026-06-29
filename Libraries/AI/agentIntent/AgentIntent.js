export class AgentIntentFSM {
    constructor({
        initialMode,
        sync = () => {},
        perceiveWorld,
        pickPolicy,
        transitionReason,
        states,
        modeExitDelayTicks = {},
        contextFrame,
        augmentContext = (ctx) => ctx,
        onClear = null,
        onResetMode = null,
        onTransition = null,
    }) {
        this.mode = initialMode;
        this.targetId = null;
        this.lastTransitionReason = "init";
        this.ticks = 0;
        this.tickAtLastTransition = 0;
        this.sync = sync;
        this.perceiveWorld = perceiveWorld;
        this.pickPolicy = pickPolicy;
        this.transitionReason = transitionReason;
        this.states = states;
        this.modeExitDelayTicks = modeExitDelayTicks;
        this.onClear = onClear;
        this.onResetMode = onResetMode;
        this.onTransition = onTransition;
        this.context = contextFrame ?? { agent: null, state: null, world: null, policy: null, mode: null, targetId: null, ticks: 0, lastModeChangeTick: 0 };
        this.augmentContext = augmentContext;
    }
    _syncContext(agent, state, world, policy) {
        this.context.agent = agent;
        this.context.state = state;
        this.context.world = world;
        this.context.policy = policy;
        this.context.mode = this.mode;
        this.context.targetId = this.targetId;
        this.context.ticks = this.ticks;
        this.context.lastModeChangeTick = this.tickAtLastTransition;
        return this.augmentContext(this.context);
    }
    _commitTransition(agent, state, world, policy) {
        const prevMode = this.mode;
        this.mode = policy.mode;
        this.targetId = policy.targetId;
        this.lastTransitionReason = policy.reason;
        if (prevMode !== this.mode) this.tickAtLastTransition = this.ticks;
        const enterContext = this._syncContext(agent, state, world, policy);
        if (this.onTransition) this.onTransition(agent, state, prevMode, this.mode);
        const nextState = this.states[this.mode];
        if (nextState?.enter) nextState.enter(this, enterContext);
    }
    _shouldTransition(policy, world) {
        if (policy.mode === this.mode && policy.targetId === this.targetId) return false;
        if (policy.mode === "flee") return true;
        if (policy.targetId === null && this.targetId !== null) return true;
        const currentScore = world?.decisionContext?.candidateScores?.[this.mode];
        if (currentScore === undefined || currentScore === -Infinity) return true;
        const delay = this.modeExitDelayTicks[this.mode] ?? 0;
        if (policy.mode !== this.mode && this.ticks - this.tickAtLastTransition < delay) return false;
        return true;
    }
    perceive(agent, state) {
        this.sync(agent, state);
    }
    transition(agent, state) {
        this.ticks++;
        const world = this.perceiveWorld(agent, state);
        const policy = this.pickPolicy(world);
        if (this._shouldTransition(policy, world)) {
            if (!policy.reason && this.transitionReason) policy.reason = this.transitionReason(this.mode, policy.mode, policy, world);
            this._commitTransition(agent, state, world, policy);
            return this._syncContext(agent, state, world, policy);
        }
        const currentState = this.states[this.mode];
        const ctx = this._syncContext(agent, state, world, policy);
        if (currentState?.update) currentState.update(this, ctx);
        return ctx;
    }
    refresh(agent, state) {
        this.perceive(agent, state);
        return this.transition(agent, state);
    }
    clear(agent, state) {
        this.lastTransitionReason = "cleared";
        this.targetId = null;
        if (this.onClear) this.onClear(agent, state);
    }
    resetMode(agent, state) {
        this.targetId = null;
        this.lastTransitionReason = "reset";
        this.ticks = 0;
        this.tickAtLastTransition = 0;
        if (this.onResetMode) this.onResetMode(agent, state);
    }
    getMode() {
        return this.mode;
    }
    getTargetId() {
        return this.targetId;
    }
    clearTargetId() {
        this.targetId = null;
    }
    getLastTransitionReason() {
        return this.lastTransitionReason;
    }
    transitionTo(nextMode, reason, nextTargetId = null) {
        this._commitTransition(this.context.agent, this.context.state, this.context.world, { mode: nextMode, targetId: nextTargetId, reason });
    }
    setLastTransition(reason) {
        this.lastTransitionReason = reason;
    }
    holdDestination(reason = "held_latch") {
        this.lastTransitionReason = reason;
    }
}
function safeHoldDestination(fsm, reason) {
    if (fsm?.holdDestination) fsm.holdDestination(reason);
    else if (fsm?.effects?.holdDestination) fsm.effects.holdDestination(reason);
}
function safeSetLastTransition(fsm, reason) {
    if (fsm?.setLastTransition) fsm.setLastTransition(reason);
    else if (fsm?.effects?.setLastTransition) fsm.effects.setLastTransition(reason);
}
function safeTransitionTo(fsm, nextMode, reason, nextTargetId) {
    if (fsm?.transitionTo) fsm.transitionTo(nextMode, reason, nextTargetId);
    else if (fsm?.effects?.transitionTo) fsm.effects.transitionTo(nextMode, reason, nextTargetId);
}
function safeSetSeekDestination(fsm, ctx, target, setSeekLocal) {
    if (fsm?.effects?.setSeekDestination) fsm.effects.setSeekDestination(target);
    else setSeekLocal(ctx, target);
}
function safeUpdateSeekTarget(fsm, ctx, target, locomotion) {
    if (fsm?.effects?.updateSeekTarget) fsm.effects.updateSeekTarget(target);
    else locomotion.updateSeekTarget?.(ctx.agent, ctx.state, target, { targetId: ctx.targetId });
}
// ==========================================
// Intent States
// ==========================================
export function createExploreIntentState(deps = {}) {
    return {
        enter(fsm, ctx) {
            const actualCtx = ctx ?? fsm;
            const locomotion = deps.locomotion ?? actualCtx.locomotion;
            const resolveExploreCell = deps.resolveExploreCell ?? actualCtx.resolveExploreCell;
            const brain = deps.brain ?? actualCtx.brain;
            const cell = resolveExploreCell(actualCtx.agent, actualCtx.state, brain.spatial, Math.random);
            if (cell) locomotion.setExplore(actualCtx.agent, actualCtx.state, cell);
        },
        update(fsm, ctx) {
            const actualCtx = ctx ?? fsm;
            const locomotion = deps.locomotion ?? actualCtx.locomotion;
            const resolveExploreCell = deps.resolveExploreCell ?? actualCtx.resolveExploreCell;
            const brain = deps.brain ?? actualCtx.brain;
            const hasArrived = locomotion.hasArrivedAtDest(actualCtx.agent, actualCtx.grid);
            const needsNewDest = !actualCtx.dest || hasArrived;
            if (needsNewDest) {
                safeSetLastTransition(fsm, hasArrived ? "arrived" : "repick_dest");
                const cell = resolveExploreCell(actualCtx.agent, actualCtx.state, brain.spatial, Math.random);
                if (cell) locomotion.setExplore(actualCtx.agent, actualCtx.state, cell);
                return;
            }
            safeHoldDestination(fsm);
        },
    };
}
export function createSeekIntentState(deps = {}) {
    const seekOptionsScratch = { arrivalRadius: 0, lockOnTarget: undefined, terminalHoming: undefined, targetId: null };
    const shouldRefreshSeekDestination = (ctx, targetCell) => {
        const locomotion = deps.locomotion ?? ctx.locomotion;
        if (!ctx.dest) return true;
        if (locomotion.hasArrivedAtDest(ctx.agent, ctx.grid)) return true;
        if (ctx.dest.col !== targetCell.col || ctx.dest.row !== targetCell.row) return true;
        if (!ctx.dest.lockOnTarget || !ctx.dest.world) return false;
        const isSameTarget = ctx.dest.targetId != null && ctx.dest.targetId === ctx.target.id;
        return !isSameTarget;
    };
    const setSeekDestination = (ctx, target) => {
        const locomotion = deps.locomotion ?? ctx.locomotion;
        const seekArrivalRadius = deps.seekArrivalRadius ?? ctx.seekArrivalRadius;
        if (!target) return;
        const seekOptions = seekArrivalRadius(ctx.mode, ctx.agent, target, ctx.state);
        if (typeof seekOptions === "object" && seekOptions !== null) {
            seekOptionsScratch.arrivalRadius = seekOptions.arrivalRadius;
            seekOptionsScratch.lockOnTarget = seekOptions.lockOnTarget;
            seekOptionsScratch.terminalHoming = seekOptions.terminalHoming;
        } else {
            seekOptionsScratch.arrivalRadius = seekOptions;
            seekOptionsScratch.lockOnTarget = undefined;
            seekOptionsScratch.terminalHoming = undefined;
        }
        seekOptionsScratch.targetId = ctx.targetId;
        locomotion.setSeek(ctx.agent, ctx.state, target, seekOptionsScratch);
    };
    return {
        enter(fsm, ctx) {
            const actualCtx = ctx ?? fsm;
            safeSetSeekDestination(fsm, actualCtx, actualCtx.target, setSeekDestination);
        },
        update(fsm, ctx) {
            const actualCtx = ctx ?? fsm;
            const locomotion = deps.locomotion ?? actualCtx.locomotion;
            if (!actualCtx.target) {
                safeTransitionTo(fsm, actualCtx.policy?.mode, "target_lost", actualCtx.policy?.targetId);
                return;
            }
            const targetCell = { col: actualCtx.grid.worldCol(actualCtx.target.x), row: actualCtx.grid.worldRow(actualCtx.target.y) };
            if (shouldRefreshSeekDestination(actualCtx, targetCell)) {
                const arrived = locomotion.hasArrivedAtDest(actualCtx.agent, actualCtx.grid);
                safeSetLastTransition(fsm, arrived ? "arrived" : "repick_dest");
                safeSetSeekDestination(fsm, actualCtx, actualCtx.target, setSeekDestination);
                return;
            }
            safeUpdateSeekTarget(fsm, actualCtx, actualCtx.target, locomotion);
            safeHoldDestination(fsm);
        },
    };
}
export function createFleeIntentState(deps = {}) {
    return {
        enter(fsm, ctx) {
            const actualCtx = ctx ?? fsm;
            const locomotion = deps.locomotion ?? actualCtx.locomotion;
            const setFleeDestination = deps.setFleeDestination ?? actualCtx.setFleeDestination;
            setFleeDestination({ agent: actualCtx.agent, state: actualCtx.state, world: actualCtx.world, avoidCell: null, locomotion });
        },
        update(fsm, ctx) {
            const actualCtx = ctx ?? fsm;
            const locomotion = deps.locomotion ?? actualCtx.locomotion;
            const setFleeDestination = deps.setFleeDestination ?? actualCtx.setFleeDestination;
            if (!actualCtx.dest) {
                safeSetLastTransition(fsm, "repick_dest");
                setFleeDestination({ agent: actualCtx.agent, state: actualCtx.state, world: actualCtx.world, avoidCell: null, locomotion });
                return;
            }
            const reachedDest = locomotion.hasReachedDest(ctx.agent, ctx.grid);
            if (reachedDest && ctx.fleeTarget) {
                const nextCell = setFleeDestination({ agent: ctx.agent, state: ctx.state, world: ctx.world, avoidCell: ctx.dest, locomotion });
                const isNewCell = nextCell && (nextCell.col !== ctx.dest.col || nextCell.row !== ctx.dest.row);
                fsm.setLastTransition(isNewCell ? "flee_continue" : "held_latch");
                return;
            }
            fsm.holdDestination();
        },
    };
}
// ==========================================
// Policy Latching / Hysteresis
// ==========================================
export function createModePolicyLatch({ mode, minTicks = 0, holdReason = `${mode}_held`, refreshWhen = () => false, canRelease = () => true }) {
    let active = false;
    let ticksRemaining = 0;
    const holdPolicy = (policy) => ({ mode, targetId: null, reason: holdReason, blockedPolicy: policy });
    return {
        apply(policy, context = {}) {
            if (context.currentMode === mode && !active) {
                active = true;
                ticksRemaining = minTicks;
            }
            if (policy.mode === mode) {
                active = true;
                ticksRemaining = Math.max(ticksRemaining, minTicks);
                return policy;
            }
            if (!active) return policy;
            if (refreshWhen(context, policy)) ticksRemaining = Math.max(ticksRemaining, minTicks);
            if (ticksRemaining > 0) {
                ticksRemaining--;
                return holdPolicy(policy);
            }
            if (!canRelease(context, policy)) return holdPolicy(policy);
            active = false;
            return policy;
        },
        clear() {
            active = false;
            ticksRemaining = 0;
        },
        snapshot() {
            return { mode, active, ticksRemaining };
        },
    };
}
// ==========================================
// Target Events
// ==========================================
export function routeEventsInto(out, routeStatus) {
    out.length = 0;
    if (!routeStatus) return out;
    if (routeStatus.routeFailed) out.push("ROUTE_FAILED");
    if (routeStatus.destReached) out.push("DEST_REACHED");
    return out;
}
export function pushTargetEvents(events, kind, visibleTarget, rememberedTarget) {
    const upper = kind.toUpperCase();
    if (visibleTarget) {
        events.push(`${upper}_SEEN`);
        return;
    }
    if (rememberedTarget) events.push(kind === "prey" ? "PREY_LAST_SEEN_ACTIVE" : `${upper}_REMEMBERED`);
}
export function routeEvents(routeStatus) {
    return routeEventsInto([], routeStatus);
}
export function policyReasonForTarget(ctx, kind) {
    if (ctx.remembered[kind]) return `${kind}_memory`;
    return null;
}
export function intentPolicyInto(out, mode, targetId, reason = null) {
    out.mode = mode;
    out.targetId = targetId;
    out.reason = reason;
    return out;
}
export function intentPolicy(mode, targetId, reason = null) {
    const out = { mode: null, targetId: null, reason: null };
    return intentPolicyInto(out, mode, targetId, reason);
}
