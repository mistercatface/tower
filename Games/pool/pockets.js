import { hideCueStick } from "../../Libraries/CueStick/cueStickController.js";
import { getCueBall, ensurePoolState, allBallsStopped, POOL_CUE_TAG, POOL_OBJECT_TAG, respotCueBall } from "./balls.js";
import { isBallInPocket } from "./config/tableLayout.js";

/**
 * @param {object} state
 * @param {object} layout
 * @param {number} dt
 */
export function processPockets(state, layout, dt) {
    if (!state.pickups || !layout?.pockets) return;
    const pool = ensurePoolState(state);
    if (pool.won) return;

    for (let i = 0; i < state.pickups.length; i++) {
        const ball = state.pickups[i];
        if (ball.isDead || (!ball[POOL_CUE_TAG] && !ball[POOL_OBJECT_TAG])) continue;

        if (ball.currentStateName === "sinking") {
            ball.sinkingTimer -= dt;
            if (ball.elevation <= -24 || ball.sinkingTimer <= 0) {
                ball.changeState("normal"); // resets mass, elevation, and opacity
                if (ball[POOL_OBJECT_TAG]) {
                    ball.isDead = true;
                    pool.objectRemaining = Math.max(0, pool.objectRemaining - 1);
                } else if (ball[POOL_CUE_TAG]) {
                    respotCueBall(state, layout);
                }
            }
            continue;
        }

        let pocketEntered = null;
        for (let p = 0; p < layout.pockets.length; p++) {
            if (isBallInPocket(ball, layout.pockets[p])) {
                pocketEntered = layout.pockets[p];
                break;
            }
        }

        if (pocketEntered) {
            ball.changeState("sinking");
            ball.sinkingTimer = 1500; // ms (allow up to 1.5 seconds for complete fall)
            ball.pocketX = pocketEntered.x;
            ball.pocketY = pocketEntered.y;
        }
    }

    // Check game won / aiming transition (only when no balls are sinking)
    let anySinking = false;
    for (let i = 0; i < state.pickups.length; i++) {
        if (state.pickups[i].currentStateName === "sinking") {
            anySinking = true;
            break;
        }
    }

    if (!anySinking) {
        if (pool.objectRemaining <= 0) {
            pool.won = true;
            pool.phase = "won";
            hideCueStick(pool);
        } else if (pool.phase === "rolling" && allBallsStopped(state)) {
            pool.phase = "aiming";
        }
    }
}
