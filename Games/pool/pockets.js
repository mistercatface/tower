import { requestUiUpdate } from "../../Core/EventSystem.js";
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
            // Check if the ball has bounced out of the pocket mouth back onto the felt
            const dx = ball.x - ball.pocketX;
            const dy = ball.y - ball.pocketY;
            const dist = Math.hypot(dx, dy);
            const pocketRadius = ball.pocketRadius ?? 16;
            const captureThreshold = pocketRadius * 0.65;
            const pocketDepth = ball.pocketDepth ?? 24;
            // Mark the ball as captured once it rolls deep enough into the pocket cup (dist <= captureThreshold)
            if (dist <= captureThreshold) ball.sinkingCaptured = true;
            // If the ball has rolled outside the pocket radius and is still shallow (elevation > -6),
            // and was NOT captured, it "rims out" and returns to normal table play.
            if (!ball.sinkingCaptured && ball.elevation > -6 && dist > pocketRadius) {
                ball.changeState("normal");
                continue;
            }
            if (ball.elevation <= -pocketDepth || ball.sinkingTimer <= 0) {
                ball.changeState("normal"); // resets mass, elevation, and opacity
                if (ball[POOL_OBJECT_TAG]) {
                    ball.isDead = true;
                    pool.objectRemaining = Math.max(0, pool.objectRemaining - 1);
                    requestUiUpdate();
                } else if (ball[POOL_CUE_TAG]) respotCueBall(state, layout);
            }
            continue;
        }
        let pocketEntered = null;
        for (let p = 0; p < layout.pockets.length; p++)
            if (isBallInPocket(ball, layout.pockets[p])) {
                pocketEntered = layout.pockets[p];
                break;
            }
        if (pocketEntered) {
            ball.changeState("sinking");
            ball.sinkingTimer = 1500; // ms (allow up to 1.5 seconds for complete fall)
            ball.pocketX = pocketEntered.x;
            ball.pocketY = pocketEntered.y;
            ball.pocketRadius = pocketEntered.radius;
            ball.pocketDepth = layout.pocketDepth ?? 24;
            ball.tableCenterX = layout.tableCenterX;
            ball.tableCenterY = layout.tableCenterY;
            ball.sinkingCaptured = false;
        }
    }
    // Check game won / aiming transition (only when no balls are sinking)
    let anySinking = false;
    for (let i = 0; i < state.pickups.length; i++)
        if (state.pickups[i].currentStateName === "sinking") {
            anySinking = true;
            break;
        }
    if (!anySinking)
        if (pool.objectRemaining <= 0) {
            if (!pool.won) {
                pool.won = true;
                pool.phase = "won";
                requestUiUpdate();
            }
        } else if (pool.phase === "rolling" && allBallsStopped(state)) {
            pool.phase = "aiming";
            requestUiUpdate();
        }
}
