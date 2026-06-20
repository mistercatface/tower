/**
 * Read-only view of worker-baked nav topology for live runtime.
 * @param {import("../Pathfinding/HpaPathWorker.js").HpaPathWorker} hpaPathWorker
 * @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid
 */
export function createWorkerGridNavContextView(hpaPathWorker, grid) {
    const emptyNav = new Uint8Array(0);
    return {
        grid,
        get wallRevision() {
            return grid.wallGridRevision;
        },
        get navCardinalOpen() {
            return hpaPathWorker.getNavArena()?.cardinalOpen ?? emptyNav;
        },
        get vertexPassability() {
            return hpaPathWorker.getNavArena()?.vertexPassability ?? emptyNav;
        },
    };
}
