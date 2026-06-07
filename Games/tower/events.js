import { events } from "../../Core/EventSystem.js";
import { Events } from "../../Core/EventNames.js";
export function setGameZoomFromSlider(sliderValue) {
    events.emit(Events.GAME_SET_ZOOM, { sliderValue });
}
export function adjustGameZoom(delta) {
    events.emit(Events.GAME_ADJUST_ZOOM, { delta });
}
export function setGameZoomAbsolute(zoom) {
    events.emit(Events.GAME_SET_ZOOM_ABSOLUTE, { zoom });
}
export function emitMapToggle() {
    events.emit(Events.MAP_TOGGLE);
}
