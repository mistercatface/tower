import { HPA_WORKER_URL } from "../../Render/WorldSurfaceBootstrap.js";
import { HpaPathWorker } from "../Pathfinding/HpaPathWorker.js";
import { HpaPathSession } from "../Pathfinding/HpaPathSession.js";
import { NavRuntime } from "./NavRuntime.js";
const mockFlowFieldGrid = { invalidateNavTopology() {} };
/** @type {Set<NavRuntime> | null} */
let testNavigations = null;
export function enableTestNavigationTracking() {
    if (!testNavigations) testNavigations = new Set();
}
/**
 * @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} obstacleGrid
 * @param {{ flowFieldGrid?: import("../Pathfinding/FlowFieldGrid.js").FlowFieldGrid | { invalidateNavTopology(): void }, settings?: object }} [options]
 */
export function createNavRuntime(obstacleGrid, { flowFieldGrid = mockFlowFieldGrid, settings = {} } = {}) {
    const worker = new HpaPathWorker(HPA_WORKER_URL, obstacleGrid);
    const session = new HpaPathSession(worker);
    const runtime = new NavRuntime({ grid: obstacleGrid, worker, session, flowFieldGrid, settings });
    testNavigations?.add(runtime);
    return runtime;
}
/** @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} obstacleGrid */
export function createWorkerNavigationService(obstacleGrid) {
    return createNavRuntime(obstacleGrid);
}
/** @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} obstacleGrid @param {import("../DataStructures/CellRect.js").CellBounds | null} [damageBounds] */
export async function createWorkerNavigation(obstacleGrid, damageBounds = null) {
    const runtime = createNavRuntime(obstacleGrid);
    await runtime.onObstaclesChanged(damageBounds);
    return runtime;
}
/** @param {NavRuntime} navigation @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} [grid] @param {import("../DataStructures/CellRect.js").CellBounds | null} [damageBounds] */
export async function syncWorkerNavigationTopology(navigation, grid = navigation.worker.navGraph, damageBounds = null) {
    await navigation.worker.scheduleNavTopologySyncAwait(grid, damageBounds);
    navigation.obstacleGeneration++;
}
/** @param {NavRuntime} navigation */
export async function terminateWorkerNavigation(navigation) {
    if (!navigation?.worker) return;
    testNavigations?.delete(navigation);
    await navigation.shutdown();
}
export async function terminateAllWorkerNavigations() {
    if (!testNavigations?.size) return;
    const pending = [...testNavigations].map((navigation) => terminateWorkerNavigation(navigation));
    testNavigations.clear();
    await Promise.allSettled(pending);
}
export { NavRuntime, resolveNavRuntime } from "./NavRuntime.js";
export { NavTopology } from "./NavTopology.js";
