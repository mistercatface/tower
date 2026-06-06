import { isInspector } from "../../GameState/GamePhase.js";
import { ProgressionManager } from "../../Progression/ProgressionManager.js";
import { unlockProximityFightDialog } from "../../Libraries/RunScene/behaviors/proximityRadioFight.js";
import { isRadioDialogActive as isTowerRadioDialogActive } from "./wireRadio.js";
import {
    findInspectCollectPickup,
    getInspectCollectMissionBanner,
    handleInspectCollectClose,
    handleInspectCollectOpen,
    isInspectCollectActive,
} from "../../Libraries/RunScene/behaviors/inspectCollect.js";
export function getInspectMissionBanner(state) {
    if (!isInspector(state.phase)) return { show: false, text: "" };
    return getInspectCollectMissionBanner(state);
}
export function findInspectorInspectPickup(state, worldX, worldY) {
    return findInspectCollectPickup(state, worldX, worldY);
}
export function onInspectMissionOpen(state, inspectKey) {
    handleInspectCollectOpen(state, inspectKey);
}
export function onInspectMissionClose(state, inspectKey) {
    handleInspectCollectClose(state, inspectKey);
}
export function isInspectMissionActive(state) {
    return isInspectCollectActive(state);
}
export function onRunOpeningComplete({ state, upgrades }) {
    ProgressionManager.setupNewRunAbilities(state, upgrades);
    unlockProximityFightDialog(state);
}
export function isRadioDialogActive() {
    return isTowerRadioDialogActive();
}
