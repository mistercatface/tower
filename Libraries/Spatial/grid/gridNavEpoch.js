/**
 * Nav invalidation spine — one key answers "is walkability stale?"
 *
 * **Channels** (bump via `bumpGridNavEpoch` on grid edits):
 * - `wallGridRevision` — voxels, edges, boundaries, passage geometry
 * - `floorNavEpoch` — belt kinds / floor nav facing
 * - `gridTopologyEpoch` — grid resize / rebind (cols×rows changed)
 * - `_passagePowerNavKey` — powered forcefield network (via `setGridPassagePowerNavKey`)
 *
 * **Canonical key:** `gridNavCacheKey(grid)` folds all channels into one string.
 * Compare it everywhere — never mirror it on the grid object.
 *
 * **Who reads it:**
 * - `HpaPathWorker` — topology bake (`syncedNavCacheKey`, set when worker acks `syncNavDone`)
 * - `FlowFieldGrid` — local window bind (`syncLocalTopology`)
 * - `NavigationService.syncedNavCacheKey` — host mirror after sync (debug + walkability caches)
 *
 * **Separate from topology key:** `NavigationService.obstacleGeneration` / worker `_graphEpoch`
 * track HPA region-graph replan completion (partial patches can finish while topology key is unchanged).
 * Replan predicates use obstacleGeneration; topology readiness uses `gridNavCacheKey`.
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
/** Canonical nav-topology staleness key — all invalidation channels + passage power. */
export function gridNavCacheKey(grid) {
    return `${grid.wallGridRevision}:${grid.gridTopologyEpoch}:${grid.floorNavEpoch}:${grid._passagePowerNavKey ?? ""}`;
}
/** @param {import("./WorldObstacleGrid.js").WorldObstacleGrid} grid @param {string} syncedNavCacheKey */
export function isGridNavStale(grid, syncedNavCacheKey) {
    return gridNavCacheKey(grid) !== syncedNavCacheKey;
}
/** Passage edge (forcefield) sprite draw cache key. */
export function passageEdgeDrawCacheKey(grid) {
    return `${grid.wallGridRevision}:${grid._passagePowerNavKey ?? ""}`;
}
/** @param {import("./WorldObstacleGrid.js").WorldObstacleGrid} grid @param {string} key */
export function setGridPassagePowerNavKey(grid, key) {
    grid._passagePowerNavKey = key;
}
