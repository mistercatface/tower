import { installNodeWorkerShim } from "./installNodeWorkerShim.js";
import { createWorkerNavigation, syncWorkerNavigationTopology, terminateWorkerNavigation } from "../../Libraries/Navigation/WorkerNavigationFactory.js";
installNodeWorkerShim();
/** @deprecated Use createWorkerNavigation — kept as test alias. */
export const createTestNavigation = createWorkerNavigation;
/** @deprecated Use syncWorkerNavigationTopology — kept as test alias. */
export const syncTestNavigationTopology = syncWorkerNavigationTopology;
/** @deprecated Use terminateWorkerNavigation — kept as test alias. */
export const terminateTestNavigation = terminateWorkerNavigation;
/**
 * @param {import("../../Systems/Navigation/NavigationService.js").NavigationService} navigation
 * @param {import("../../Libraries/DataStructures/CellRect.js").CellBounds | null} [damageBounds]
 * @param {{ topologyOnly?: boolean }} [options]
 */
export async function syncTestNavigation(navigation, damageBounds = null, { topologyOnly = false } = {}) {
    if (topologyOnly) await syncWorkerNavigationTopology(navigation, navigation._hpaPathWorker.navGraph, damageBounds);
    else await navigation.onObstaclesChanged(damageBounds);
}
