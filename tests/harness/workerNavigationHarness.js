import { installNodeWorkerShim } from "./installNodeWorkerShim.js";
import { HPA_WORKER_URL } from "../../Render/WorldSurfaceBootstrap.js";
import { HpaPathWorker } from "../../Libraries/Pathfinding/HpaPathWorker.js";
import { NavigationService } from "../../Systems/Navigation/NavigationService.js";
installNodeWorkerShim();
const mockFlowFieldGrid = { invalidateNavTopology() {} };
/**
 * Worker-backed navigation stack for tests — mirrors SharedGameState nav wiring.
 * @param {import("../../Libraries/Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} obstacleGrid
 * @param {import("../../Libraries/DataStructures/CellRect.js").CellBounds | null} [damageBounds]
 * @param {{ topologyOnly?: boolean }} [options]
 * @returns {Promise<NavigationService>}
 */
export async function createTestNavigation(obstacleGrid, damageBounds = null, { topologyOnly = false } = {}) {
    const hpaPathWorker = new HpaPathWorker(HPA_WORKER_URL, obstacleGrid);
    const navigation = new NavigationService(mockFlowFieldGrid, obstacleGrid, {}, hpaPathWorker);
    if (topologyOnly) await syncTestNavigationTopology(navigation, obstacleGrid, damageBounds);
    else await navigation.onObstaclesChanged(damageBounds);
    return navigation;
}
/**
 * Topology bake only — skip HPA region-graph build (passability/vision tests).
 * @param {NavigationService} navigation
 * @param {import("../../Libraries/Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} [grid]
 * @param {import("../../Libraries/DataStructures/CellRect.js").CellBounds | null} [damageBounds]
 */
export async function syncTestNavigationTopology(navigation, grid = navigation._hpaPathWorker.navGraph, damageBounds = null) {
    await navigation._hpaPathWorker.scheduleNavTopologySyncAwait(grid, damageBounds);
    navigation.obstacleGeneration++;
}
/**
 * @param {NavigationService} navigation
 * @param {import("../../Libraries/DataStructures/CellRect.js").CellBounds | null} [damageBounds]
 * @param {{ topologyOnly?: boolean }} [options]
 */
export async function syncTestNavigation(navigation, damageBounds = null, { topologyOnly = false } = {}) {
    if (topologyOnly) await syncTestNavigationTopology(navigation, navigation._hpaPathWorker.navGraph, damageBounds);
    else await navigation.onObstaclesChanged(damageBounds);
}
/** @param {NavigationService} navigation */
export function terminateTestNavigation(navigation) {
    navigation._hpaPathWorker?.host?.worker?.terminate();
}
