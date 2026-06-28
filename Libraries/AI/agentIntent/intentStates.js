// ==========================================
// Explore Intent State
// ==========================================
export function createExploreIntentState() {
    return {
        /** Called when entering explore state. Chooses a new destination cell. */
        enter(ctx) {
            ctx.effects.setExploreDestination();
        },
        /** Called on update tick. Repicks destination if agent has arrived. */
        update(ctx) {
            const hasArrived = ctx.locomotion.hasArrivedAtDest(ctx.agent, ctx.grid);
            const needsNewDest = !ctx.dest || hasArrived;
            if (needsNewDest) {
                // Determine reason and choose a new explore target
                ctx.effects.setLastTransition(hasArrived ? "arrived" : "repick_dest");
                ctx.effects.setExploreDestination();
                return;
            }
            // Otherwise, maintain current pathing destination
            ctx.effects.holdDestination();
        },
    };
}
// ==========================================
// Seek Intent State (used for food, allies, enemies)
// ==========================================
export function createSeekIntentState() {
    /** Helper: returns true if the seek target moved or path needs recalculation. */
    const shouldRefreshSeekDestination = (ctx, targetCell) => {
        if (!ctx.dest) return true;
        if (ctx.locomotion.hasArrivedAtDest(ctx.agent, ctx.grid)) return true;
        if (ctx.dest.col !== targetCell.col || ctx.dest.row !== targetCell.row) return true;
        if (!ctx.dest.lockOnTarget || !ctx.dest.world) return false;
        const isSameTarget = ctx.dest.targetId != null && ctx.dest.targetId === ctx.target.id;
        return !isSameTarget;
    };
    return {
        /** Called when entering seek state. Begins pathing to target. */
        enter(ctx) {
            ctx.effects.setSeekDestination(ctx.target);
        },
        /** Called on update tick. Follows target and refreshes destination dynamically. */
        update(ctx) {
            // Target lost fallback
            if (!ctx.target) {
                ctx.effects.transitionTo(ctx.policy.mode, "target_lost", ctx.policy.targetId);
                return;
            }
            // Convert target position to grid cells
            const targetCell = { col: ctx.grid.worldCol(ctx.target.x), row: ctx.grid.worldRow(ctx.target.y) };
            // Update destination if target moved or we arrived
            if (shouldRefreshSeekDestination(ctx, targetCell)) {
                const arrived = ctx.locomotion.hasArrivedAtDest(ctx.agent, ctx.grid);
                ctx.effects.setLastTransition(arrived ? "arrived" : "repick_dest");
                ctx.effects.setSeekDestination(ctx.target);
                return;
            }
            // Keep heading towards the current path destination
            ctx.effects.updateSeekTarget?.(ctx.target);
            ctx.effects.holdDestination();
        },
    };
}
// ==========================================
// Flee Intent State (running away from threat)
// ==========================================
export function createFleeIntentState() {
    return {
        /** Called when entering flee state. Instantly picks a flee path away from threat. */
        enter(ctx) {
            ctx.effects.setFleeDestination(null);
        },
        /** Called on update tick. Re-evaluates flee paths dynamically. */
        update(ctx) {
            // Pick fallback explore or new flee destination if none exists
            if (!ctx.dest) {
                ctx.effects.setLastTransition("repick_dest");
                ctx.effects.setFleeDestination(null);
                return;
            }
            // Reached safety spot but threat is still active - repick flee destination
            const reachedDest = ctx.locomotion.hasReachedDest(ctx.agent, ctx.grid);
            if (reachedDest && ctx.fleeTarget) {
                const nextCell = ctx.effects.setFleeDestination(ctx.dest);
                const isNewCell = nextCell && (nextCell.col !== ctx.dest.col || nextCell.row !== ctx.dest.row);
                ctx.effects.setLastTransition(isNewCell ? "flee_continue" : "held_latch");
                return;
            }
            // Continue pathing to the selected escape cell
            ctx.effects.holdDestination();
        },
    };
}
