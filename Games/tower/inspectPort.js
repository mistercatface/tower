import { isInspector } from "../../GameState/GamePhase.js";
import {
    findInspectCollectPickup,
    getInspectCollectMissionBanner,
    handleInspectCollectClose,
    handleInspectCollectOpen,
    isInspectCollectActive,
} from "../../Libraries/RunScene/behaviors/inspectCollect.js";
import { registerGameInspectEntries } from "./content/inspect/inspectContent.js";
export const towerInspectPort = {
    registerEntries() {
        registerGameInspectEntries();
    },
    getMissionBanner(state) {
        if (!isInspector(state.phase)) return { show: false, text: "" };
        return getInspectCollectMissionBanner(state);
    },
    findPickup(state, worldX, worldY) {
        return findInspectCollectPickup(state, worldX, worldY);
    },
    onMissionOpen(state, inspectKey) {
        handleInspectCollectOpen(state, inspectKey);
    },
    onMissionClose(state, inspectKey) {
        handleInspectCollectClose(state, inspectKey);
    },
    isMissionActive(state) {
        return isInspectCollectActive(state);
    },
};
