export { SharedGameState } from "./SharedGameState.js";
/** @typedef {import("./SharedGameState.js").SharedGameState} SharedGameState */
/** @typedef {SharedGameState} GameState */
/** @type {GameState | null} */
let activeState = null;
/** @param {GameState} state */
export function installGameState(state) {
    activeState = state;
}
/** @returns {GameState} */
export function getGameState() {
    if (!activeState) throw new Error("getGameState: no active state — call installGameState during boot first");
    return activeState;
}
