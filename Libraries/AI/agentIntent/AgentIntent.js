export class AgentIntentFSM {
    constructor({
        initialMode,
        sync = () => {},
        perceiveWorld,
        pickPolicy,
        transitionReason,
        states,
        modeExitDelayTicks = {},
        effects,
        contextFrame,
        augmentContext = (ctx) => ctx,
        onClear = null,
        onResetMode = null,
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

        // Legacy compat: the states expect a single context object that gets mutated
        this.context = contextFrame ?? {
            agent: null, state: null, world: null, policy: null,
            mode: null, targetId: null, ticks: 0, lastModeChangeTick: 0, effects
        };
        this.context.effects = effects;
        this.augmentContext = augmentContext;

        // Legacy compat: effects callbacks that mutate FSM state
        if (this.context.effects) {
            this.context.effects.transitionTo = (nextMode, reason, nextTargetId = null) => {
                this._commitTransition(this.context.agent, this.context.state, this.context.world, { mode: nextMode, targetId: nextTargetId, reason });
            };
            this.context.effects.setLastTransition = (reason) => {
                this.lastTransitionReason = reason;
            };
            this.context.effects.holdDestination = (reason = "held_latch") => {
                this.lastTransitionReason = reason;
            };
        }
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
        
        if (prevMode !== this.mode) {
            this.tickAtLastTransition = this.ticks;
        }

        const enterContext = this._syncContext(agent, state, world, policy);
        if (enterContext.effects?.clearDestination) {
            enterContext.effects.clearDestination();
        }

        const nextState = this.states[this.mode];
        if (nextState?.enter) {
            nextState.enter(enterContext);
        }
    }

    _shouldTransition(policy) {
        if (policy.mode === this.mode && policy.targetId === this.targetId) return false;
        const delay = this.modeExitDelayTicks[this.mode] ?? 0;
        if (policy.mode !== this.mode && (this.ticks - this.tickAtLastTransition) < delay) return false;
        return true;
    }

    perceive(agent, state) {
        this.sync(agent, state);
    }

    transition(agent, state) {
        this.ticks++;
        const world = this.perceiveWorld(agent, state);
        const policy = this.pickPolicy(world);

        if (this._shouldTransition(policy)) {
            if (!policy.reason && this.transitionReason) {
                policy.reason = this.transitionReason(this.mode, policy.mode, policy, world);
            }
            this._commitTransition(agent, state, world, policy);
            return this._syncContext(agent, state, world, policy);
        }

        const currentState = this.states[this.mode];
        const ctx = this._syncContext(agent, state, world, policy);
        if (currentState?.update) {
            currentState.update(ctx);
        }
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
        this.mode = this.mode; // Usually reset to initialMode, but keeping generic
        this.targetId = null;
        this.lastTransitionReason = "reset";
        this.ticks = 0;
        this.tickAtLastTransition = 0;
        if (this.onResetMode) this.onResetMode(agent, state);
    }

    getMode() { return this.mode; }
    getTargetId() { return this.targetId; }
    clearTargetId() { this.targetId = null; }
    getLastTransitionReason() { return this.lastTransitionReason; }
}

// ==========================================
// Intent States
// ==========================================

export function createExploreIntentState() {
    return {
        enter(ctx) {
            ctx.effects.setExploreDestination();
        },
        update(ctx) {
            const hasArrived = ctx.locomotion.hasArrivedAtDest(ctx.agent, ctx.grid);
            const needsNewDest = !ctx.dest || hasArrived;
            if (needsNewDest) {
                ctx.effects.setLastTransition(hasArrived ? "arrived" : "repick_dest");
                ctx.effects.setExploreDestination();
                return;
            }
            ctx.effects.holdDestination();
        },
    };
}

export function createSeekIntentState() {
    const shouldRefreshSeekDestination = (ctx, targetCell) => {
        if (!ctx.dest) return true;
        if (ctx.locomotion.hasArrivedAtDest(ctx.agent, ctx.grid)) return true;
        if (ctx.dest.col !== targetCell.col || ctx.dest.row !== targetCell.row) return true;
        if (!ctx.dest.lockOnTarget || !ctx.dest.world) return false;
        const isSameTarget = ctx.dest.targetId != null && ctx.dest.targetId === ctx.target.id;
        return !isSameTarget;
    };
    return {
        enter(ctx) {
            ctx.effects.setSeekDestination(ctx.target);
        },
        update(ctx) {
            if (!ctx.target) {
                ctx.effects.transitionTo(ctx.policy.mode, "target_lost", ctx.policy.targetId);
                return;
            }
            const targetCell = { col: ctx.grid.worldCol(ctx.target.x), row: ctx.grid.worldRow(ctx.target.y) };
            if (shouldRefreshSeekDestination(ctx, targetCell)) {
                const arrived = ctx.locomotion.hasArrivedAtDest(ctx.agent, ctx.grid);
                ctx.effects.setLastTransition(arrived ? "arrived" : "repick_dest");
                ctx.effects.setSeekDestination(ctx.target);
                return;
            }
            ctx.effects.updateSeekTarget?.(ctx.target);
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
            const reachedDest = ctx.locomotion.hasReachedDest(ctx.agent, ctx.grid);
            if (reachedDest && ctx.fleeTarget) {
                const nextCell = ctx.effects.setFleeDestination(ctx.dest);
                const isNewCell = nextCell && (nextCell.col !== ctx.dest.col || nextCell.row !== ctx.dest.row);
                ctx.effects.setLastTransition(isNewCell ? "flee_continue" : "held_latch");
                return;
            }
            ctx.effects.holdDestination();
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

export function intentPolicy(mode, targetId, reason = null) {
    const policy = { mode, targetId };
    if (reason) policy.reason = reason;
    return policy;
}
