import { events } from "../../Core/EventSystem.js";
import { Events } from "../../Core/EventNames.js";
/** @type {import("../../Core/GameDefinitionTypes.js").InputPort} */
export const towerInput = { onWheelZoomDelta: (delta) => events.emit(Events.GAME_ADJUST_ZOOM, { delta }), onPinchZoom: (zoom) => events.emit(Events.GAME_SET_ZOOM_ABSOLUTE, { zoom }) };
