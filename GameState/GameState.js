import { PoolGameState } from "../Games/pool/PoolGameState.js";
import { TowerGameState } from "../Games/tower/TowerGameState.js";
export { SharedGameState } from "./SharedGameState.js";
export { TowerGameState } from "../Games/tower/TowerGameState.js";
export { PoolGameState } from "../Games/pool/PoolGameState.js";
/** @typedef {import("./SharedGameState.js").SharedGameState} SharedGameState */
/** @typedef {import("../Games/tower/TowerGameState.js").TowerGameState} TowerGameState */
/** @typedef {import("../Games/pool/PoolGameState.js").PoolGameState} PoolGameState */
/** @typedef {TowerGameState | PoolGameState} GameState */
/** Back-compat alias for dev tools that expect tower-shaped state. */
export { TowerGameState as GameState };
/** @type {GameState | null} */
let activeState = null;
/**
 * @param {import("../Core/GameDefinitionTypes.js").GameDefinition} definition
 * @returns {GameState}
 */
export function createGameStateForDefinition(definition) {
    if (definition.id === "pool") return new PoolGameState();
    return new TowerGameState();
}
/** @param {GameState} state */
export function installGameState(state) {
    activeState = state;
}
/** @returns {GameState | null} */
export function peekGameState() {
    return activeState;
}
/** @returns {GameState} */
export function getGameState() {
    if (!activeState) throw new Error("getGameState: no active state — call installGameState from createGame first");
    return activeState;
}
