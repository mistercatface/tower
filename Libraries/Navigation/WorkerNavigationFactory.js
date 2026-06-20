import { HPA_WORKER_URL } from "../../Render/WorldSurfaceBootstrap.js";
import { HpaPathWorker } from "../Pathfinding/HpaPathWorker.js";
import { NavigationService } from "../../Systems/Navigation/NavigationService.js";
const mockFlowFieldGrid = { invalidateNavTopology() {} };
/** @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} obstacleGrid */
export function createWorkerNavigationService(obstacleGrid) {
    const hpaPathWorker = new HpaPathWorker(HPA_WORKER_URL, obstacleGrid);
    return new NavigationService(mockFlowFieldGrid, obstacleGrid, {}, hpaPathWorker);
}
/** @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} obstacleGrid @param {import("../DataStructures/CellRect.js").CellBounds | null} [damageBounds] */
export async function createWorkerNavigation(obstacleGrid, damageBounds = null) {
    const navigation = createWorkerNavigationService(obstacleGrid);
    await navigation.onObstaclesChanged(damageBounds);
    return navigation;
}
/** @param {NavigationService} navigation @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} [grid] @param {import("../DataStructures/CellRect.js").CellBounds | null} [damageBounds] */
export async function syncWorkerNavigationTopology(navigation, grid = navigation._hpaPathWorker.navGraph, damageBounds = null) {
    await navigation._hpaPathWorker.scheduleNavTopologySyncAwait(grid, damageBounds);
    navigation.obstacleGeneration++;
}
/** @param {NavigationService} navigation */
export function terminateWorkerNavigation(navigation) {
    navigation._hpaPathWorker.host.worker.terminate();
}
