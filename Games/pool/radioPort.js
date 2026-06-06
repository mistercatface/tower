import { isRadioDialogActive, wirePoolRadio } from "./wireRadio.js";
/** @typedef {import("../../Core/GameDefinitionTypes.js").RadioPort} RadioPort */
/** @type {RadioPort} */
export const poolRadioPort = {
    wire(eventBus, pauseApi) {
        wirePoolRadio(eventBus, pauseApi);
    },
    isDialogActive() {
        return isRadioDialogActive();
    },
};
