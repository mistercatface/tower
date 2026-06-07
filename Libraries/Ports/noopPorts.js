/** @typedef {import("../../Core/GameDefinitionTypes.js").InspectPort} InspectPort */
/** @typedef {import("../../Core/GameDefinitionTypes.js").CombatPort} CombatPort */
/** @typedef {import("../../Core/GameDefinitionTypes.js").RadioPort} RadioPort */
/** @type {InspectPort} */
export const NOOP_INSPECT_PORT = {
    getMissionBanner() {
        return { show: false, text: "" };
    },
    findPickup() {
        return null;
    },
    onMissionOpen() {},
    onMissionClose() {},
    isMissionActive() {
        return false;
    },
};
/** @type {CombatPort} */
export const NOOP_COMBAT_PORT = {};
/** @type {RadioPort} */
export const NOOP_RADIO_PORT = {
    isDialogActive() {
        return false;
    },
};
