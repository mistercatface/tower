import { syncVertexPassability } from "./vertexPassability.js";
/**
 * Recompute derived grid topology caches (worker-candidate; Spatial-owned).
 * Call after wall revision bumps or passage-power topology changes.
 *
 * @param {import("./WorldObstacleGrid.js").WorldObstacleGrid} grid
 * @param {string} passagePowerSyncKey
 */
export function syncGridTopologyCaches(grid, passagePowerSyncKey) {
    syncVertexPassability(grid, passagePowerSyncKey);
}
