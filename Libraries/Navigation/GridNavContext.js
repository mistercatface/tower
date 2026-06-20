import { clampCellBoundsToGrid } from "../DataStructures/CellRect.js";
import { expandNavTopologyBakeBounds } from "../Pathfinding/navTopologySab.js";
import { recomputeNavCardinalOpenInto, recomputeVertexPassabilityInto } from "../Spatial/grid/vertexPassability.js";
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
export function createGridNavContext(grid) {
    const cellCount = grid.cols * grid.rows;
    const vertCount = (grid.cols + 1) * (grid.rows + 1);
    return { grid, wallRevision: grid.wallGridRevision, navCardinalOpen: new Uint8Array(cellCount), vertexPassability: new Uint8Array(vertCount) };
}
export function resolveNavTopologyBakeBounds(grid, damageBounds) {
    if (!damageBounds) return null;
    const copyBounds = clampCellBoundsToGrid(damageBounds, grid.cols, grid.rows);
    return expandNavTopologyBakeBounds(copyBounds, grid.cols, grid.rows);
}
export function syncGridNavContext(context, grid, damageBounds = null) {
    const cellCount = grid.cols * grid.rows;
    const vertCount = (grid.cols + 1) * (grid.rows + 1);
    if (context.navCardinalOpen.length !== cellCount || context.vertexPassability.length !== vertCount) {
        context.navCardinalOpen = new Uint8Array(cellCount);
        context.vertexPassability = new Uint8Array(vertCount);
        damageBounds = null;
    }
    const bakeBounds = resolveNavTopologyBakeBounds(grid, damageBounds);
    recomputeVertexPassabilityInto(grid, context.vertexPassability, bakeBounds);
    recomputeNavCardinalOpenInto(grid, context.navCardinalOpen, context.vertexPassability, bakeBounds);
    context.grid = grid;
    context.wallRevision = grid.wallGridRevision;
}
export function createTestNavigation(obstacleGrid) {
    const gridNavContext = createGridNavContext(obstacleGrid);
    syncGridNavContext(gridNavContext, obstacleGrid);
    /** @type {((damageBounds: import("../DataStructures/CellRect.js").CellBounds | null) => void) | null} */
    let navWalkableSyncHook = null;
    const navigation = {
        settings: {},
        obstacleGeneration: 0,
        gridNavContext,
        setNavWalkableSyncHook(hook) {
            navWalkableSyncHook = hook;
        },
        onObstaclesChanged(damageBounds) {
            syncGridNavContext(gridNavContext, obstacleGrid, damageBounds);
            navigation.obstacleGeneration++;
            navWalkableSyncHook?.(damageBounds);
            return Promise.resolve();
        },
    };
    return navigation;
}
