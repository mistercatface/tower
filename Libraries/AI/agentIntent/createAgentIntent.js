export function createAgentIntent({
    initialMode,
    sync = () => {},
    perceiveWorld,
    pickPolicy,
    transitionReason,
    states,
    modeExitDelayTicks = {},
    createEffects = () => ({}),
    createContext = (ctx) => ctx,
    onClear = null,
    onResetMode = null,
}) {
    let mode = initialMode;
    let targetId = null;
    let lastTransitionReason = "init";
    let ticks = 0;
    let lastModeChangeTick = 0;
    const stateByMode = states;
    const makeContext = (agent, state, world, policy) => {
        const baseContext = { agent, state, world, policy, mode, targetId, ticks, lastModeChangeTick };
        const domainEffects = createEffects(baseContext);
        const effects = {
            ...domainEffects,
            transitionTo(nextMode, reason, nextTargetId = null) {
                commit(agent, state, nextMode, nextTargetId, reason, world);
            },
            setLastTransition(reason) {
                lastTransitionReason = reason;
            },
            holdDestination(reason = "held_latch") {
                lastTransitionReason = reason;
            },
        };
        return createContext({ ...baseContext, effects });
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
        const enterWorld = world ?? perceiveWorld(agent, state);
        const enterContext = makeContext(agent, state, enterWorld, { mode: nextMode, targetId: nextTargetId });
        enterContext.effects.clearDestination?.();
        enterCurrentState(agent, state, enterWorld, { mode: nextMode, targetId: nextTargetId });
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
        const policy = { ...pickPolicy(world) };
        if (chooseTransition(agent, state, world, policy)) return makeContext(agent, state, world, policy);
        const current = stateByMode[mode];
        const context = makeContext(agent, state, world, policy);
        if (current?.update) current.update(context);
        return makeContext(agent, state, world, policy);
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
