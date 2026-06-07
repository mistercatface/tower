import { hideCueStick } from "../../Libraries/CueStick/cueStickController.js";
import { getCueBall, ensurePoolState, allBallsStopped, POOL_CUE_TAG, POOL_OBJECT_TAG, respotCueBall } from "./balls.js";
import { isBallInPocket } from "./config/tableLayout.js";
/**
 * @param {object} state
 * @param {object} layout
 */
export function processPockets(state, layout) {
    if (!state.pickups || !layout?.pockets) return;
    const pool = ensurePoolState(state);
    if (pool.won) return;
    for (let i = 0; i < state.pickups.length; i++) {
        const ball = state.pickups[i];
        if (ball.isDead || (!ball[POOL_CUE_TAG] && !ball[POOL_OBJECT_TAG])) continue;
        let sunk = false;
        for (let p = 0; p < layout.pockets.length; p++)
            if (isBallInPocket(ball, layout.pockets[p])) {
                sunk = true;
                break;
            }
        if (!sunk) continue;
        if (ball[POOL_OBJECT_TAG]) {
            ball.isDead = true;
            pool.objectRemaining = Math.max(0, pool.objectRemaining - 1);
        } else if (ball[POOL_CUE_TAG]) respotCueBall(state, layout);
    }
    if (pool.objectRemaining <= 0) {
        pool.won = true;
        pool.phase = "won";
        hideCueStick(pool);
    } else if (pool.phase === "rolling" && allBallsStopped(state)) pool.phase = "aiming";
}
