import { Events } from "../../Core/EventNames.js";
import { createRadioRegistry } from "./createRadioRegistry.js";
import { createRadioController } from "./RadioController.js";
import { createRadioDialogView } from "./RadioDialogView.js";
import { registerRadio } from "./registerRadio.js";
/**
 * @param {{ conversations: Record<string, object>, speakers: Record<string, object>, mainCharacterId: string }} content
 */
export function createRadioSystem({ conversations, speakers, mainCharacterId }) {
    const registry = createRadioRegistry({ conversations, speakers });
    /** @type {ReturnType<typeof createRadioController> | null} */
    let controller = null;
    function wire(eventBus, { requestPause, requestResume, rootElement = document }) {
        const PAUSE_REASON = "radio";
        const view = createRadioDialogView({ mainCharacterId, getSpeaker: (id) => registry.getSpeaker(id), rootElement });
        controller = createRadioController({
            registry,
            requestPause: () => requestPause(PAUSE_REASON),
            requestResume: () => requestResume(PAUSE_REASON),
            onShowLine: (payload) => eventBus.emit(Events.UI_SHOW_RADIO, payload),
            onHide: () => eventBus.emit(Events.UI_HIDE_RADIO),
        });
        registerRadio(eventBus, controller, view, Events);
        return controller;
    }
    function isDialogActive() {
        return controller?.isActive() ?? false;
    }
    return { wire, isDialogActive, registry };
}
