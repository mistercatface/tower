import { gridSettings } from "../../Config/Config.js";
import { markRadioTriggersSeen } from "./runScene/index.js";
import { getStartGameLayout } from "./tutorial/StartGameBuilding.js";
import { towerRadio } from "./radio.js";
/** @typedef {import("./runScene/runScenePorts.js").RunScenePorts} RunScenePorts */
/** @type {RunScenePorts} */
export const towerRunScenePorts = {
    getLayout(state) {
        const mapNode = state.getStartMapNode?.();
        if (!mapNode) return null;
        const worldCoords = state.getNodeWorldCoords(mapNode);
        return getStartGameLayout(worldCoords.x, worldCoords.y, gridSettings.cellSize);
    },
    radioRegistry: towerRadio.registry,
    markRadiosSeen(state, triggers) {
        markRadioTriggersSeen(state, triggers, towerRadio.registry);
    },
    applySpawn(state, spawnSlot, ctx = null) {
        const spawn = towerRunScenePorts.getLayout(state)?.spawnSlots?.[spawnSlot];
        if (!spawn) return;
        state.player.setSpawnPosition(spawn.x, spawn.y);
        state.player.resetToSpawn();
        state.spawnRunParty();
        ctx?.viewport?.snapTo(state.player.x, state.player.y);
    },
};
