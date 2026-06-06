import { isRadioDialogActive } from "./wireRadio.js";
/** @typedef {import("../../Core/GameDefinitionTypes.js").RadioPort} RadioPort */
/** @type {RadioPort} */
export const towerRadioPort = {
    isDialogActive() {
        return isRadioDialogActive();
    },
};
