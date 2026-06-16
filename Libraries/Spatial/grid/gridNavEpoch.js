/** Nav / draw invalidation channels on {@link import("./WorldObstacleGrid.js").WorldObstacleGrid}. */
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
/** Worker/main nav topology epoch key — all invalidation channels + passage power topology. */
export function gridNavCacheKey(grid) {
    return `${grid.wallGridRevision}:${grid.gridTopologyEpoch}:${grid.floorNavEpoch}:${grid._passagePowerNavKey ?? ""}`;
}
/** Passage edge (forcefield) sprite draw cache key. */
export function passageEdgeDrawCacheKey(grid) {
    return `${grid.wallGridRevision}:${grid._passagePowerNavKey ?? ""}`;
}
/** @param {import("./WorldObstacleGrid.js").WorldObstacleGrid} grid @param {string} key */
export function setGridPassagePowerNavKey(grid, key) {
    grid._passagePowerNavKey = key;
}
