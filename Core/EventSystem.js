import { EventBus } from "../Libraries/Events/EventBus.js";
import { Events } from "./EventNames.js";
export const events = new EventBus();
export function requestUiUpdate() {
    events.emit(Events.UI_UPDATE);
}
export function requestUiHudUpdate() {
    events.emit(Events.UI_UPDATE_HUD);
}
export function spawnFloatingText(data) {
    events.emit(Events.FX_FLOATING_TEXT, data);
}
export function emitCombatEnemyKilled(enemy) {
    events.emit(Events.COMBAT_ENEMY_KILLED, { enemy });
}
export function requestGamePause(reason) {
    events.emit(Events.GAME_PAUSE, { reason });
}
export function requestGameResume(reason) {
    events.emit(Events.GAME_RESUME, { reason });
}
export function toggleGamePause() {
    events.emit(Events.GAME_TOGGLE_PAUSE);
}
export function adjustGameSpeed(delta) {
    events.emit(Events.GAME_SET_SPEED, { delta });
}
/** End the run once — call from game code when win/lose happens, not from the main loop. */
export function endRun(state) {
    if (!state || state.isGameOver) return;
    state.isGameOver = true;
    events.emit(Events.UI_SHOW_GAME_OVER);
    requestUiUpdate();
}
export function showGameOver() {
    events.emit(Events.UI_SHOW_GAME_OVER);
}
export function hideGameOver() {
    events.emit(Events.UI_HIDE_GAME_OVER);
}
export function emitGameRestart() {
    events.emit(Events.GAME_RESTART);
}
export { Events } from "./EventNames.js";
