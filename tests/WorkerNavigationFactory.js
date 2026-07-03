import { HPA_WORKER_URL } from "../Render/WorldSurfaceBootstrap.js";
import { HpaPathWorker } from "../Libraries/Pathfinding/HpaPathWorker.js";
import { HpaPathSession } from "../Libraries/Pathfinding/HpaPathSession.js";
import { NavRuntime } from "../Libraries/Navigation/NavRuntime.js";
const mockFlowFieldGrid = { invalidateNavTopology() {} };
/** @type {Set<NavRuntime> | null} */
let testNavigations = null;
export function enableTestNavigationTracking() {
    if (!testNavigations) testNavigations = new Set();
}
/**
 * @param {import("../Libraries/Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} obstacleGrid
 * @param {{ flowFieldGrid?: import("../Libraries/Pathfinding/FlowFieldGrid.js").FlowFieldGrid | { invalidateNavTopology(): void }, settings?: object }} [options]
 */
export function createNavRuntime(obstacleGrid, { flowFieldGrid = mockFlowFieldGrid, settings = {} } = {}) {
    const worker = new HpaPathWorker(HPA_WORKER_URL, obstacleGrid);
    const session = new HpaPathSession(worker);
    const runtime = new NavRuntime({ grid: obstacleGrid, worker, session, flowFieldGrid, settings });
    testNavigations?.add(runtime);
    return runtime;
}
/** @param {import("../Libraries/Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} obstacleGrid @param {import("../Libraries/DataStructures/CellRect.js").CellBounds | null} [damageBounds] */
export async function createWorkerNavigation(obstacleGrid, damageBounds = null) {
    const runtime = createNavRuntime(obstacleGrid);
    await runtime.commitEdit(damageBounds, { fullNavSync: damageBounds == null });
    return runtime;
}
/** @param {NavRuntime} nav */
export async function terminateWorkerNavigation(nav) {
    if (!nav?.worker) return;
    testNavigations?.delete(nav);
    await nav.shutdown();
}
export async function terminateAllWorkerNavigations() {
    if (!testNavigations?.size) return;
    const pending = [...testNavigations].map((nav) => terminateWorkerNavigation(nav));
    testNavigations.clear();
    await Promise.allSettled(pending);
}
export { NavRuntime, resolveNavRuntime } from "../Libraries/Navigation/NavRuntime.js";
export { NavTopology } from "../Libraries/Navigation/NavTopology.js";
