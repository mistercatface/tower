export function createGridCellVisionSession() {
    return {
        tick: 0,
        wallRevision: -1,
        /** @type {Map<string, boolean>} */
        losCache: new Map(),
    };
}
/** @param {ReturnType<typeof createGridCellVisionSession> | null | undefined} session @param {number} wallRevision */
export function beginGridCellVisionTick(session, wallRevision) {
    if (!session) return;
    session.tick++;
    if (session.wallRevision !== wallRevision) {
        session.losCache.clear();
        session.wallRevision = wallRevision;
        return;
    }
    session.losCache.clear();
}
export function gridCellLosCacheKey(col0, row0, col1, row1) {
    return `${col0},${row0}:${col1},${row1}`;
}
export function beginGridVisionTick(state, tickId) {
    const nav = state.nav;
    if (nav._gridVisionBeginTick === tickId) return;
    nav._gridVisionBeginTick = tickId;
    if (!nav.gridCellVisionSession) nav.gridCellVisionSession = createGridCellVisionSession();
    beginGridCellVisionTick(nav.gridCellVisionSession, nav.topology.wallRevision);
}
