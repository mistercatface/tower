import { fireRadioTrigger } from "../../Core/EventSystem.js";
import { markRadioTriggersSeen } from "../../Libraries/RunScene/markRadioTriggersSeen.js";
import { spawnPoolBalls, createInitialPoolState, ensurePoolState } from "./balls.js";
import { getPoolLayout } from "./config/tableLayout.js";
import { processPockets } from "./pockets.js";
import { poolRadioRegistry } from "./wireRadio.js";
/** @typedef {import("../../Core/GameDefinitionTypes.js").RunScenePort} RunScenePort */
/** Dev shortcut: `?scene=play` skips the opening coach radio. */
function shouldSkipOpeningRadio() {
    if (typeof window === "undefined") return false;
    const scene = new URLSearchParams(window.location.search).get("scene");
    return scene === "play" || scene === "match";
}
function snapCameraToTable(state, ctx) {
    const layout = getPoolLayout(state);
    if (layout?.tableCenterX != null && ctx?.viewport) ctx.viewport.snapTo(layout.tableCenterX, layout.tableCenterY);
}
/** @type {RunScenePort} */
export const poolRunScenePort = {
    getLayout(state) {
        return getPoolLayout(state);
    },
    onSimulationEnter(ctx) {
        const { state } = ctx;
        state.pool = createInitialPoolState();
        state.radioSeenThisRun = {};
        if (state.pickups) state.pickups.length = 0;
        spawnPoolBalls(state, getPoolLayout(state));
        snapCameraToTable(state, ctx);
        if (shouldSkipOpeningRadio()) markRadioTriggersSeen(state, ["break_shot"], poolRadioRegistry);
        else fireRadioTrigger("break_shot", null, state);
    },
    onTick(ctx, _dt) {
        const { state } = ctx;
        processPockets(state, getPoolLayout(state), _dt);
        const pool = ensurePoolState(state);
        if (pool.won && !pool.clearRadioFired) {
            pool.clearRadioFired = true;
            fireRadioTrigger("table_clear", null, state);
        }
    },
    getCapabilities(_state) {
        return { horde: false, blockTurret: false };
    },
};
