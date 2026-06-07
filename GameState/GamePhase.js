export const GamePhase = { MAP: "map", SIMULATION: "simulation", INSPECTOR: "inspector" };
const WORLD_SCENES = new Set([GamePhase.SIMULATION, GamePhase.INSPECTOR]);
export function isWorldScene(phase) {
    return WORLD_SCENES.has(phase);
}
export function isSimulation(phase) {
    return phase === GamePhase.SIMULATION;
}
export function isInspector(phase) {
    return phase === GamePhase.INSPECTOR;
}
