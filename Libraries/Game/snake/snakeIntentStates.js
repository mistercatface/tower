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
