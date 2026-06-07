import { markRadioTriggersSeen } from "../../Libraries/RunScene/index.js";
import { getPoolLayout } from "./config/tableLayout.js";
import { poolRadioRegistry } from "./wireRadio.js";
/** @typedef {import("../../Libraries/RunScene/runScenePorts.js").RunScenePorts} RunScenePorts */
/** @type {RunScenePorts} */
export const poolRunScenePorts = {
    getLayout(state) {
        return getPoolLayout(state);
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
