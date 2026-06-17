/** Baseline simulation playback tuning. */
export const LIBRARY_PLAYBACK_DEFAULTS = { minSpeed: 0.25, maxSpeed: 2.0, step: 0.25 };
export function resolveMaxSpeed(state) {
    const upgradeMax = state.runStats?.gameSpeed?.value;
    if (upgradeMax != null) return upgradeMax;
    return LIBRARY_PLAYBACK_DEFAULTS.maxSpeed;
}
export function resolveMinSpeed() {
    return LIBRARY_PLAYBACK_DEFAULTS.minSpeed;
}
export function resolveStep() {
    return LIBRARY_PLAYBACK_DEFAULTS.step;
}
/** @param {object} state */
export function clampSelectedSpeed(state) {
    const max = resolveMaxSpeed(state);
    const min = resolveMinSpeed();
    state.selectedSpeed = Math.max(min, Math.min(max, state.selectedSpeed));
    return state.selectedSpeed;
}
/** @param {object} state @param {number} delta */
export function adjustSelectedSpeed(state, delta) {
    const max = resolveMaxSpeed(state);
    const min = resolveMinSpeed();
    if (delta < 0) state.selectedSpeed = Math.max(min, state.selectedSpeed + delta);
    else state.selectedSpeed = Math.min(max, state.selectedSpeed + delta);
    return state.selectedSpeed;
}
/** @param {object} state */
export function getSpeedControlView(state) {
    const max = resolveMaxSpeed(state);
    const min = resolveMinSpeed();
    const speed = Math.max(min, Math.min(max, state.selectedSpeed));
    return { speedLabel: `${speed.toFixed(2)}x`, pauseLabel: state.isPaused ? "PLAY" : "PAUSE", canDecrease: speed > min, canIncrease: speed < max, isPaused: !!state.isPaused };
}
