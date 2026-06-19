export function createSnakeLocomotion(navBehavior, directBehavior, setActiveBehaviorId, navBehaviorId) {
    let destCol = null;
    let destRow = null;
    let destWorld = null;
    return {
        getDestination() {
            if (destCol == null || destRow == null) return null;
            return { col: destCol, row: destRow, world: destWorld };
        },
        setDestination(grid, col, row) {
            const changed = destCol !== col || destRow !== row;
            destCol = col;
            destRow = row;
            destWorld = grid.gridToWorld(col, row);
            return changed;
        },
        clearDestination() {
            destCol = null;
            destRow = null;
            destWorld = null;
        },
        needsRetry(seeker) {
            if (destCol == null) return true;
            const nav = navBehavior();
            if (!nav.hasMoveTarget(seeker)) return true;
            return nav.needsNavRetry(seeker);
        },
        tickNav(seeker, state) {
            directBehavior().clearMoveTarget(seeker);
            const nav = navBehavior();
            if (destCol == null) {
                nav.clearMoveTarget(seeker);
                return;
            }
            setActiveBehaviorId(seeker.id, navBehaviorId);
            const targetCell = nav.getTargetCell(seeker);
            const cellMatches = targetCell && targetCell.col === destCol && targetCell.row === destRow;
            if (!cellMatches) nav.setMoveTarget(seeker, destWorld);
            else if (nav.needsNavRetry(seeker)) nav.replanMoveTarget(seeker, state);
        },
        getStatus(seeker, state) {
            const nav = navBehavior();
            const navStatus = nav.getLocomotionStatus(seeker);
            return { hasDest: destCol != null, destCol, destRow, hasRoute: navStatus.hasRoute, replanPending: navStatus.replanPending, stuckFrames: navStatus.stuckFrames, pathLen: navStatus.pathLen };
        },
    };
}
export function formatSnakeFsmDebug(snapshot) {
    const dest = snapshot.destCell ? `${snapshot.destCell.col},${snapshot.destCell.row}` : "—";
    const replan = snapshot.replanReason;
    const speed = Math.hypot(snapshot.vx, snapshot.vy).toFixed(1);
    return `${snapshot.mode} | ${dest} | plen=${snapshot.pathLen} | ${replan} | v=${speed} | ${snapshot.lastTransition}`;
}
