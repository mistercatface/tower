import { resolveRepositionTarget } from "../../Libraries/Pathfinding/PathClearance.js";
function isDiveActive(ctx) {
    for (const upg of ctx.upgrades) {
        if (!upg.isAbility || upg.triggerType !== "double_tap_move" || !ctx.state.abilities[upg.id]) continue;
        if (ctx.state.scheduler.getTimeRemaining(ctx.state.abilityTimers[upg.id].activeId) > 0) return true;
    }
    return false;
}
function triggerDoubleTapAbilities(ctx) {
    for (const upg of ctx.upgrades) {
        if (!upg.isAbility || upg.triggerType !== "double_tap_move" || !ctx.state.abilities[upg.id]) continue;
        if (ctx.state.scheduler.getTimeRemaining(ctx.state.abilityTimers[upg.id].cooldownId) > 0) continue;
        ctx.state.abilityTimers[upg.id].activeId = ctx.state.scheduler.schedule(upg.activeDuration);
        ctx.state.abilityTimers[upg.id].cooldownId = ctx.state.scheduler.schedule(upg.cooldown);
        if (upg.onTrigger) upg.onTrigger(ctx.state);
    }
}
function applyRepositionTarget(ctx, target, targetCell, isDoubleTap) {
    if (isDiveActive(ctx)) {
        ctx.state.player.queueTarget(target.x, target.y, targetCell);
        return;
    }
    ctx.state.player.setTarget(target.x, target.y, ctx.state, targetCell);
    ctx.state.navigation.rebuildPlayerFlowField(target.x, target.y);
    if (isDoubleTap) triggerDoubleTapAbilities(ctx);
}
/**
 * Tap-to-move / double-tap-dive. Optional `intercept` runs first (return true to consume).
 *
 * @param {object} ctx
 * @param {{ x: number, y: number }} worldCoords
 * @param {boolean} isDoubleTap
 * @param {{ intercept?: (worldCoords: { x: number, y: number }) => boolean }} [options]
 */
export function handlePlayerRepositionTap(ctx, worldCoords, isDoubleTap, options = {}) {
    if (options.intercept?.(worldCoords)) return;
    if (!ctx.state.player.canReposition(ctx.state)) return;
    const target = resolveRepositionTarget(ctx.state.obstacleGrid, worldCoords.x, worldCoords.y, ctx.state.player.radius);
    if (!target) return;
    const targetCell = target.col != null ? { col: target.col, row: target.row } : null;
    applyRepositionTarget(ctx, target, targetCell, isDoubleTap);
}
/**
 * Drag-to-move while pointer is held.
 *
 * @param {object} ctx
 * @param {{ x: number, y: number }} worldCoords
 */
export function handlePlayerRepositionDrag(ctx, worldCoords) {
    if (!ctx.state.player.canReposition(ctx.state)) return;
    const target = resolveRepositionTarget(ctx.state.obstacleGrid, worldCoords.x, worldCoords.y, ctx.state.player.radius);
    if (!target) return;
    const targetCell = target.col != null ? { col: target.col, row: target.row } : null;
    ctx.state.player.setTarget(target.x, target.y, ctx.state, targetCell);
    ctx.state.navigation.rebuildPlayerFlowField(target.x, target.y);
}
