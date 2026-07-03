import { EventBus } from "../Libraries/Events/index.js";
import { Events } from "./EventNames.js";
export const events = new EventBus();
export function requestUiUpdate() {
    events.emit(Events.UI_UPDATE);
}
export { Events } from "./EventNames.js";
