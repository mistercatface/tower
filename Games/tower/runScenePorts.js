import { gridSettings } from "../../Config/Config.js";
import { markRadioTriggersSeen } from "../../Libraries/RunScene/index.js";
import { getStartGameLayout } from "./tutorial/StartGameBuilding.js";
import { towerRadioRegistry } from "./wireRadio.js";

/** @typedef {import("../../Libraries/RunScene/runScenePorts.js").RunScenePorts} RunScenePorts */

/** @type {RunScenePorts} */
export const towerRunScenePorts = {
    getLayout(state) {
        const mapNode = state.getStartMapNode?.();
        if (!mapNode) return null;
        const combatCoords = state.getNodeCombatCoords(mapNode);
        return getStartGameLayout(combatCoords.x, combatCoords.y, gridSettings.cellSize);
    },

    radioRegistry: towerRadioRegistry,

    markRadiosSeen(state, triggers) {
        markRadioTriggersSeen(state, triggers, towerRadioRegistry);
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
