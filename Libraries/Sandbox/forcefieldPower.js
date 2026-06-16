import { passagePowerNavKey, syncPassagePowerNetwork } from "./passagePowerNetwork.js";
/** @param {object} state */
export function syncForcefieldButtonPower(state) {
    const grid = state.obstacleGrid;
    if (!grid.cols || !grid.edgeStore.passageEdgeCount) return;
    const key = passagePowerNavKey(state);
    if (key === grid._passagePowerNavKey) return;
    syncPassagePowerNetwork(state);
}
