/**
 * Nav invalidation spine.
 *
 * Grid edits bump channels via `bumpGridNavEpoch`. They fold into `gridNavCacheKey(grid)`.
 * Topology readiness: `isNavTopologyReady(hpaPathWorker, grid)` — the only staleness check.
 *
 * `HpaPathWorker._syncedNavCacheKey` is the sole synced-key store (set on worker ack).
 * Replan epoch (`NavigationService.obstacleGeneration`) is separate — not topology readiness.
 * Live grid edits must call `commitGridNavEdit` / `commitGridNavEditUnion` (Libraries/Sandbox/gridNavEdit.js) after writes.
 */
export const GRID_NAV_EPOCH = { Wall: "wall", Floor: "floor", Topology: "topology" };
/**
 * @param {import("./WorldObstacleGrid.js").WorldObstacleGrid} grid
 * @param {(typeof GRID_NAV_EPOCH)[keyof typeof GRID_NAV_EPOCH]} channel
 */
export function bumpGridNavEpoch(grid, channel) {
    switch (channel) {
        case GRID_NAV_EPOCH.Wall:
            grid.wallGridRevision = (grid.wallGridRevision + 1) | 0;
            grid.invalidateStructureZLevelsCache();
            grid.invalidateNavTopology();
            return;
        case GRID_NAV_EPOCH.Floor:
            grid.floorNavEpoch = (grid.floorNavEpoch + 1) | 0;
            grid.invalidateNavTopology();
            return;
        case GRID_NAV_EPOCH.Topology:
            grid.gridTopologyEpoch = (grid.gridTopologyEpoch + 1) | 0;
            return;
    }
    throw new Error(`unknown grid nav epoch channel: ${channel}`);
}
/** Live nav-topology key — all invalidation channels + passage power. */
export function gridNavCacheKey(grid) {
    return `${grid.wallGridRevision}:${grid.gridTopologyEpoch}:${grid.floorNavEpoch}:${grid._passagePowerNavKey ?? ""}`;
}
/**
 * @param {import("../../Pathfinding/HpaPathWorker.js").HpaPathWorker} hpaPathWorker
 * @param {import("./WorldObstacleGrid.js").WorldObstacleGrid} grid
 */
export function isNavTopologyReady(hpaPathWorker, grid) {
    if (hpaPathWorker._navSyncPromise) return false;
    return gridNavCacheKey(grid) === hpaPathWorker._syncedNavCacheKey;
}
/** Passage edge (forcefield) sprite draw cache key. */
export function passageEdgeDrawCacheKey(grid) {
    return `${grid.wallGridRevision}:${grid._passagePowerNavKey ?? ""}`;
}
/** @param {import("./WorldObstacleGrid.js").WorldObstacleGrid} grid @param {string} key */
export function setGridPassagePowerNavKey(grid, key) {
    grid._passagePowerNavKey = key;
}
