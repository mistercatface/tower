export { canRunHordeSpawning } from "../Core/GamePorts.js";
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
/** Range and center for drawing world rings / masks in simulation vs map space. */
export function getWorldDrawCoords(state, viewport, fallbackRange) {
    if (viewport && isWorldScene(state.phase)) return { useViewport: true, range: viewport.getVisualRadius() / viewport.zoom, x: viewport.x, y: viewport.y };
    const range = fallbackRange ?? state.player.weapon.range;
    return { useViewport: false, range, x: state.player.x, y: state.player.y };
}
