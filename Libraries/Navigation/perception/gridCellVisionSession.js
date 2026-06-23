import { packCellKey } from "../../DataStructures/CellKey.js";
import { mixHash4 } from "../../Math/hash.js";
export function createGridCellVisionSession() {
    return { tick: 0, wallRevision: -1, losCache: new Map() };
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
/** @returns {number} uint32 cache key for a grid-cell LOS pair */
export function gridCellLosCacheKey(col0, row0, col1, row1) {
    return mixHash4(packCellKey(col0, row0), packCellKey(col1, row1), 0, 0);
}
export function beginGridVisionTick(state, tickId) {
    const nav = state.nav;
    if (nav._gridVisionBeginTick === tickId) return;
    nav._gridVisionBeginTick = tickId;
    if (!nav.gridCellVisionSession) nav.gridCellVisionSession = createGridCellVisionSession();
    beginGridCellVisionTick(nav.gridCellVisionSession, nav.topology.wallRevision);
}
