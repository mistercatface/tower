import { events } from "../../Core/EventSystem.js";
import { Events } from "../../Core/EventNames.js";
export function setGameZoomFromSlider(sliderValue) {
    events.emit(Events.GAME_SET_ZOOM, { sliderValue });
}
export function emitMapToggle() {
    events.emit(Events.MAP_TOGGLE);
}
