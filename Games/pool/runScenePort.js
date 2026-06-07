import { fireRadioTrigger } from "../../Libraries/Radio/radioEvents.js";
import { spawnPoolBalls, createInitialPoolState, ensurePoolState } from "./balls.js";
import { getPoolLayout } from "./config/tableLayout.js";
import { processPockets } from "./pockets.js";
import { poolRadio } from "./radio.js";
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
        fireRadioTrigger("break_shot", null, state);
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
};
