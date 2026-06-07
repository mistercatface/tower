import { radioSpeakers } from "../../Config/content/radio/RadioSpeakers.js";
import { radioConversations } from "../../Config/content/radio/RadioConversations.js";
import { Events } from "../../Core/EventNames.js";
import { createRadioRegistry, createRadioController, createRadioDialogView, registerRadio } from "../../Libraries/Radio/index.js";
export const towerRadioRegistry = createRadioRegistry({ conversations: radioConversations, speakers: radioSpeakers });
/** @type {ReturnType<typeof createRadioController> | null} */
let towerRadioController = null;
/**
 * @param {import("../../Libraries/Events/EventBus.js").EventBus} eventBus
 * @param {{ requestPause: (reason: string) => void, requestResume: (reason: string) => void }} pauseApi
 */
export function wireTowerRadio(eventBus, { requestPause, requestResume }) {
    const PAUSE_REASON = "radio";
    const view = createRadioDialogView({ mainCharacterId: "brock", getSpeaker: (id) => towerRadioRegistry.getSpeaker(id) });
    towerRadioController = createRadioController({
        registry: towerRadioRegistry,
        requestPause: () => requestPause(PAUSE_REASON),
        requestResume: () => requestResume(PAUSE_REASON),
        onShowLine: (payload) => eventBus.emit(Events.UI_SHOW_RADIO, payload),
        onHide: () => eventBus.emit(Events.UI_HIDE_RADIO),
    });
    registerRadio(eventBus, towerRadioController, view, Events);
    return towerRadioController;
}
export function isRadioDialogActive() {
    return towerRadioController?.isActive() ?? false;
}
