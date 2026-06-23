export function createAgentIntent({
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
    let mode = initialMode;
    let targetId = null;
    let lastTransitionReason = "init";
    let ticks = 0;
    let lastModeChangeTick = 0;
    const stateByMode = states;
    const context = contextFrame ?? { agent: null, state: null, world: null, policy: null, mode: null, targetId: null, ticks: 0, lastModeChangeTick: 0, effects };
    context.effects = effects;
    effects.transitionTo = (nextMode, reason, nextTargetId = null) => {
        commit(context.agent, context.state, nextMode, nextTargetId, reason, context.world);
    };
    effects.setLastTransition = (reason) => {
        lastTransitionReason = reason;
    };
    effects.holdDestination = (reason = "held_latch") => {
        lastTransitionReason = reason;
    };
    const syncContext = (agent, state, world, policy) => {
        context.agent = agent;
        context.state = state;
        context.world = world;
        context.policy = policy;
        context.mode = mode;
        context.targetId = targetId;
        context.ticks = ticks;
        context.lastModeChangeTick = lastModeChangeTick;
        return augmentContext(context);
    };
    const commit = (agent, state, nextMode, nextTargetId, reason, world = null) => {
        const prevMode = mode;
        mode = nextMode;
        targetId = nextTargetId;
        lastTransitionReason = reason;
        if (prevMode !== nextMode) lastModeChangeTick = ticks;
        const enterWorld = world ?? perceiveWorld(agent, state);
        const enterPolicy = policyFrom(nextMode, nextTargetId, null);
        const enterContext = syncContext(agent, state, enterWorld, enterPolicy);
        enterContext.effects.clearDestination?.();
        stateByMode[mode]?.enter?.(enterContext);
    };
    const perceive = (agent, state) => {
        sync(agent, state);
    };
    const chooseTransition = (agent, state, world, policy) => {
        if (policy.mode === mode && policy.targetId === targetId) return false;
        const exitDelayTicks = modeExitDelayTicks[mode] ?? 0;
        if (policy.mode !== mode && ticks - lastModeChangeTick < exitDelayTicks) return false;
        commit(agent, state, policy.mode, policy.targetId, policy.reason ?? transitionReason(mode, policy.mode, policy, world), world);
        return true;
    };
    const transition = (agent, state) => {
        ticks++;
        const world = perceiveWorld(agent, state);
        const policy = pickPolicy(world);
        if (chooseTransition(agent, state, world, policy)) return syncContext(agent, state, world, policy);
        const current = stateByMode[mode];
        const ctx = syncContext(agent, state, world, policy);
        if (current?.update) current.update(ctx);
        return ctx;
    };
    return {
        perceive,
        transition,
        refresh(agent, state) {
            perceive(agent, state);
            return transition(agent, state);
        },
        clear(agent, state) {
            lastTransitionReason = "cleared";
            targetId = null;
            onClear?.(agent, state);
        },
        resetMode(agent, state) {
            mode = initialMode;
            targetId = null;
            lastTransitionReason = "reset";
            ticks = 0;
            lastModeChangeTick = 0;
            onResetMode?.(agent, state);
        },
        getMode() {
            return mode;
        },
        getTargetId() {
            return targetId;
        },
        clearTargetId() {
            targetId = null;
        },
        getLastTransitionReason() {
            return lastTransitionReason;
        },
    };
}
function policyFrom(mode, targetId, reason) {
    return { mode, targetId, reason };
}
