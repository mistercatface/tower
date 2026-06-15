import { passagePowerSyncKey, syncPassagePowerNetwork } from "./passagePowerNetwork.js";
/** @param {object} state */
export function syncForcefieldButtonPower(state) {
    const grid = state.obstacleGrid;
    if (!grid.cols || !grid.edgeStore.passageEdgeCount) return;
    const key = passagePowerSyncKey(state);
    if (key === state.sandbox._passagePowerSyncKey && state.sandbox.passagePower) return;
    syncPassagePowerNetwork(state);
}
