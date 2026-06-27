/**
 * Nav invalidation spine
 *
 * Edits → bumpGridNavEpoch(grid, channel) → gridNavCacheKey(grid) changes.
 *
 * | Cache / consumer              | Readiness check                          |
 * |-------------------------------|------------------------------------------|
 * | Worker topology arena         | gridNavCacheKey === worker._syncedNavCacheKey, no _navSyncPromise |
 * | NavRuntime.isTopologyCurrent()| same via NavRuntime.syncedTopologyKey()  |
 * | Per-agent replan (navSession) | navState.topologyKey !== nav.topologyKey() |
 * | Flow-field topology           | keys off gridNavCacheKey in FlowFieldGrid |
 * | HPA region graph (worker)     | worker._graphEpoch >= nav.graphSyncGeneration |
 *
 * Live edits must finish with nav.commitEdit(bounds) (Libraries/Sandbox/gridNavEdit.js).
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
/** Canonical live topology key — every staleness check derives from this. */
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
/** Floor belt / passage-power grid-stamp draw cache key. */
export function floorOccupancyStampDrawCacheKey(grid) {
    return `${grid.floorNavEpoch}:${grid.cols}:${grid.rows}:${grid._floorStampDrawRevision ?? 0}`;
}
/** @param {import("./WorldObstacleGrid.js").WorldObstacleGrid} grid */
export function bumpFloorOccupancyStampDrawRevision(grid) {
    grid._floorStampDrawRevision = ((grid._floorStampDrawRevision ?? 0) + 1) | 0;
}
export function bumpSurfaceMaterialRevision(grid) {
    grid.surfaceMaterialRevision = ((grid.surfaceMaterialRevision ?? 0) + 1) | 0;
}
/** @param {import("./WorldObstacleGrid.js").WorldObstacleGrid} grid @param {string} key */
export function setGridPassagePowerNavKey(grid, key) {
    grid._passagePowerNavKey = key;
}
