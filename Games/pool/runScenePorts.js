import { gridSettings } from "../../Config/Config.js";
import { markRadioTriggersSeen } from "../../Libraries/RunScene/index.js";
import { poolWorldGen } from "./worldGen.js";
import { poolRadioRegistry } from "./wireRadio.js";
/** @typedef {import("../../Libraries/RunScene/runScenePorts.js").RunScenePorts} RunScenePorts */
/** @type {RunScenePorts} */
export const poolRunScenePorts = {
    getLayout(state) {
        const mapNode = state.getStartMapNode?.();
        if (!mapNode) return null;
        const worldCoords = state.getNodeWorldCoords(mapNode);
        return poolWorldGen.getStartLayout(worldCoords.x, worldCoords.y, gridSettings.cellSize);
    },
    radioRegistry: poolRadioRegistry,
    markRadiosSeen(state, triggers) {
        markRadioTriggersSeen(state, triggers, poolRadioRegistry);
    },
    applySpawn(state, spawnSlot, ctx = null) {
        const spawn = poolRunScenePorts.getLayout(state)?.spawnSlots?.[spawnSlot];
        if (!spawn) return;
        state.player.setSpawnPosition(spawn.x, spawn.y);
        state.player.resetToSpawn();
        ctx?.viewport?.snapTo(spawn.x, spawn.y);
    },
};
