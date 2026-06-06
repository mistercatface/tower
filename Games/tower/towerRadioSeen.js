import { markRadioTriggersSeen } from "../../Libraries/RunScene/index.js";
import { towerRadioRegistry } from "./wireRadio.js";

/** @param {object} state @param {string[]} triggers */
export function markTowerRadioTriggersSeen(state, triggers) {
    markRadioTriggersSeen(state, triggers, towerRadioRegistry);
}
