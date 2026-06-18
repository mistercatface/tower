export function resolveCursorGroundNavMove(prop, behavior) {
    if (!prop || !behavior?.setMoveTarget) return null;
    return { prop, behavior };
}
export function issueCursorGroundNavMove(move, world) {
    move.behavior.setMoveTarget(move.prop, world);
}
export function updateCursorGroundNavMove(move, world) {
    move.behavior.updateMoveTarget?.(move.prop, world);
}
