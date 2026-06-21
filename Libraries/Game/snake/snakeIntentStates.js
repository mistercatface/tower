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
    const shouldRefreshSeekDestination = (ctx, targetCell) => {
        if (!ctx.dest) return true;
        if (ctx.locomotion.hasArrivedAtDest(ctx.agent, ctx.grid)) return true;
        if (ctx.dest.col !== targetCell.col || ctx.dest.row !== targetCell.row) return true;
        if (!ctx.dest.lockOnTarget || !ctx.dest.world) return false;
        const sameTarget = ctx.dest.targetId != null && ctx.dest.targetId === ctx.target.id;
        return !sameTarget;
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
            const targetCell = ctx.grid.worldToGrid(ctx.target.x, ctx.target.y);
            if (shouldRefreshSeekDestination(ctx, targetCell)) {
                ctx.effects.setLastTransition(ctx.locomotion.hasArrivedAtDest(ctx.agent, ctx.grid) ? "arrived" : "repick_dest");
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
            if (ctx.locomotion.hasReachedDest(ctx.agent, ctx.grid) && ctx.fleeTarget) {
                const nextCell = ctx.effects.setFleeDestination(ctx.dest);
                ctx.effects.setLastTransition(nextCell && (nextCell.col !== ctx.dest.col || nextCell.row !== ctx.dest.row) ? "flee_continue" : "held_latch");
                return;
            }
            ctx.effects.holdDestination();
        },
    };
}
