import { isRadioDialogActive, wireTowerRadio } from "./wireRadio.js";
/** @typedef {import("../../Core/GameDefinitionTypes.js").RadioPort} RadioPort */
/** @type {RadioPort} */
export const towerRadioPort = {
    wire(eventBus, pauseApi) {
        wireTowerRadio(eventBus, pauseApi);
    },
    isDialogActive() {
        return isRadioDialogActive();
    },
};
