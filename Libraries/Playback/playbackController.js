import { LIBRARY_PLAYBACK_DEFAULTS } from "./playbackDefaults.js";
/**
 * @typedef {import("../../Core/GameDefinitionTypes.js").GameDefinition} GameDefinition
 */
/**
 * @param {object} state
 * @param {Partial<GameDefinition> | null | undefined} definition
 */
export function resolveMaxSpeed(state, definition) {
    if (definition?.playback?.maxSpeed != null) return definition.playback.maxSpeed;
    const upgradeMax = state.runStats?.gameSpeed?.value;
    if (upgradeMax != null) return upgradeMax;
    return LIBRARY_PLAYBACK_DEFAULTS.maxSpeed;
}
/**
 * @param {Partial<GameDefinition> | null | undefined} definition
 */
export function resolveMinSpeed(definition) {
    return definition?.playback?.minSpeed ?? LIBRARY_PLAYBACK_DEFAULTS.minSpeed;
}
/**
 * @param {Partial<GameDefinition> | null | undefined} definition
 */
export function resolveStep(definition) {
    return definition?.playback?.step ?? LIBRARY_PLAYBACK_DEFAULTS.step;
}
/**
 * @param {object} state
 * @param {Partial<GameDefinition> | null | undefined} definition
 */
export function clampSelectedSpeed(state, definition) {
    const max = resolveMaxSpeed(state, definition);
    const min = resolveMinSpeed(definition);
    state.selectedSpeed = Math.max(min, Math.min(max, state.selectedSpeed));
    return state.selectedSpeed;
}
/**
 * @param {object} state
 * @param {number} delta
 * @param {Partial<GameDefinition> | null | undefined} definition
 */
export function adjustSelectedSpeed(state, delta, definition) {
    const max = resolveMaxSpeed(state, definition);
    const min = resolveMinSpeed(definition);
    if (delta < 0) state.selectedSpeed = Math.max(min, state.selectedSpeed + delta);
    else state.selectedSpeed = Math.min(max, state.selectedSpeed + delta);
    return state.selectedSpeed;
}
/**
 * @param {object} state
 * @param {Partial<GameDefinition> | null | undefined} definition
 */
export function getSpeedControlView(state, definition) {
    const max = resolveMaxSpeed(state, definition);
    const min = resolveMinSpeed(definition);
    const speed = Math.max(min, Math.min(max, state.selectedSpeed));
    return { speedLabel: `${speed.toFixed(2)}x`, pauseLabel: state.isPaused ? "PLAY" : "PAUSE", canDecrease: speed > min, canIncrease: speed < max, isPaused: !!state.isPaused };
}
