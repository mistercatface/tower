export const TowerPhase = { MAP: "map", SIMULATION: "simulation", INSPECTOR: "inspector" };
export function isTowerWorldScene(phase) {
    return phase === TowerPhase.SIMULATION || phase === TowerPhase.INSPECTOR;
}
export function isInspector(phase) {
    return phase === TowerPhase.INSPECTOR;
}
