import { events } from "../../Core/EventSystem.js";
import { Events } from "../../Core/EventNames.js";
export function startRadioConversation(conversationId, onComplete, state, { force = false } = {}) {
    events.emit(Events.RADIO_START, { conversationId, onComplete, state, force });
}
export function fireRadioTrigger(trigger, onComplete, state) {
    events.emit(Events.RADIO_TRIGGER, { trigger, onComplete, state });
}
