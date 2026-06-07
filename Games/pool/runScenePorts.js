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
    applySpawn(state, _spawnSlot, ctx = null) {
        const layout = poolRunScenePorts.getLayout(state);
        if (layout?.tableCenterX != null && ctx?.viewport) ctx.viewport.snapTo(layout.tableCenterX, layout.tableCenterY);
    },
};
