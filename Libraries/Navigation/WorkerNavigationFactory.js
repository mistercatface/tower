import { HPA_WORKER_URL } from "../../Render/WorldSurfaceBootstrap.js";
import { HpaPathWorker } from "../Pathfinding/HpaPathWorker.js";
import { NavigationService } from "../../Systems/Navigation/NavigationService.js";
const mockFlowFieldGrid = { invalidateNavTopology() {} };
/** @type {Set<NavigationService> | null} */
let testNavigations = null;
export function enableTestNavigationTracking() {
    if (!testNavigations) testNavigations = new Set();
}
/** @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} obstacleGrid */
export function createWorkerNavigationService(obstacleGrid) {
    const hpaPathWorker = new HpaPathWorker(HPA_WORKER_URL, obstacleGrid);
    const navigation = new NavigationService(mockFlowFieldGrid, obstacleGrid, {}, hpaPathWorker);
    testNavigations?.add(navigation);
    return navigation;
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
export async function terminateWorkerNavigation(navigation) {
    if (!navigation?._hpaPathWorker) return;
    testNavigations?.delete(navigation);
    navigation._hpaPathWorker.shutdown();
    await navigation._hpaPathWorker.host.worker.terminate();
}
export async function terminateAllWorkerNavigations() {
    if (!testNavigations?.size) return;
    const pending = [...testNavigations].map((navigation) => terminateWorkerNavigation(navigation));
    testNavigations.clear();
    await Promise.allSettled(pending);
}
