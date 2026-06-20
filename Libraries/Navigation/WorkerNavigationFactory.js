import { HPA_WORKER_URL } from "../../Render/WorldSurfaceBootstrap.js";
import { HpaPathWorker } from "../Pathfinding/HpaPathWorker.js";
import { NavigationService } from "../../Systems/Navigation/NavigationService.js";
const mockFlowFieldGrid = { invalidateNavTopology() {} };
/**
 * Worker-backed navigation — same wiring as SharedGameState / test harness.
 * @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} obstacleGrid
 * @param {import("../DataStructures/CellRect.js").CellBounds | null} [damageBounds]
 * @param {{ topologyOnly?: boolean }} [options]
 */
export async function createWorkerNavigation(obstacleGrid, damageBounds = null, { topologyOnly = false } = {}) {
    const hpaPathWorker = new HpaPathWorker(HPA_WORKER_URL, obstacleGrid);
    const navigation = new NavigationService(mockFlowFieldGrid, obstacleGrid, {}, hpaPathWorker);
    if (topologyOnly) await syncWorkerNavigationTopology(navigation, obstacleGrid, damageBounds);
    else await navigation.onObstaclesChanged(damageBounds);
    return navigation;
}
/**
 * @param {NavigationService} navigation
 * @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} [grid]
 * @param {import("../DataStructures/CellRect.js").CellBounds | null} [damageBounds]
 */
export async function syncWorkerNavigationTopology(navigation, grid = navigation._hpaPathWorker.navGraph, damageBounds = null) {
    await navigation._hpaPathWorker.scheduleNavTopologySyncAwait(grid, damageBounds);
    navigation.obstacleGeneration++;
}
/** @param {NavigationService} navigation */
export function terminateWorkerNavigation(navigation) {
    navigation._hpaPathWorker?.host?.worker?.terminate();
}
