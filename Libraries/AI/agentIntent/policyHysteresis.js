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
