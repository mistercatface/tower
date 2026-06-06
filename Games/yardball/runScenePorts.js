import { gridSettings } from "../../Config/Config.js";
import { markRadioTriggersSeen } from "../../Libraries/RunScene/index.js";
import { yardballWorldGen } from "./worldGen.js";
import { yardballRadioRegistry } from "./wireRadio.js";

/** @typedef {import("../../Libraries/RunScene/runScenePorts.js").RunScenePorts} RunScenePorts */

/** @type {RunScenePorts} */
export const yardballRunScenePorts = {
    getLayout(state) {
        const mapNode = state.getStartMapNode?.();
        if (!mapNode) return null;
        const combatCoords = state.getNodeCombatCoords(mapNode);
        return yardballWorldGen.getStartLayout(combatCoords.x, combatCoords.y, gridSettings.cellSize);
    },

    radioRegistry: yardballRadioRegistry,

    markRadiosSeen(state, triggers) {
        markRadioTriggersSeen(state, triggers, yardballRadioRegistry);
    },

    applySpawn(state, spawnSlot, ctx = null) {
        const spawn = yardballRunScenePorts.getLayout(state)?.spawnSlots?.[spawnSlot];
        if (!spawn) return;

        state.player.setSpawnPosition(spawn.x, spawn.y);
        state.player.resetToSpawn();
        ctx?.viewport?.snapTo(spawn.x, spawn.y);
    },
};
