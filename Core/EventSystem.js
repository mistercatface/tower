import { EventBus } from "../Libraries/Events/EventBus.js";
import { Events } from "./EventNames.js";
export const events = new EventBus();
export function requestUiUpdate() {
    events.emit(Events.UI_UPDATE);
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
export { Events } from "./EventNames.js";
