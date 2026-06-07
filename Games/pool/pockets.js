import { hideCueStick } from "../../Libraries/CueStick/cueStickController.js";
import { getCueBall, ensurePoolState, allBallsStopped, POOL_CUE_TAG, POOL_OBJECT_TAG, respotCueBall } from "./balls.js";
import { isBallInPocket } from "./config/tableLayout.js";
import { integrateRollOrientation } from "../../Libraries/Props/rollingMotion.js";

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
            if (ball.sinkingTimer <= 0) {
                ball.isDead = true;
                ball.changeState("normal"); // resets mass and elevation
                if (ball[POOL_OBJECT_TAG]) {
                    pool.objectRemaining = Math.max(0, pool.objectRemaining - 1);
                } else if (ball[POOL_CUE_TAG]) {
                    respotCueBall(state, layout);
                }
            } else {
                const duration = 600; // ms
                const progress = Math.min(1.0, Math.max(0, 1.0 - (ball.sinkingTimer / duration)));

                // Elevation sinks down to the bottom of the projected pocket (-24)
                ball.elevation = -24 * progress;

                const targetX = ball.pocketX;
                const targetY = ball.pocketY;
                const startX = ball.sinkingStartX;
                const startY = ball.sinkingStartY;

                const dx = startX - targetX;
                const dy = startY - targetY;
                const startDist = Math.hypot(dx, dy);
                const currentDist = startDist * (1.0 - progress);

                const startAngle = Math.atan2(dy, dx);
                // Rotate 1.5 times during the animation
                const angle = startAngle + 1.5 * 2 * Math.PI * progress;

                const prevX = ball.x;
                const prevY = ball.y;

                ball.x = targetX + Math.cos(angle) * currentDist;
                ball.y = targetY + Math.sin(angle) * currentDist;

                // Set virtual velocity to drive 3D roll orientation
                if (dt > 0) {
                    ball.vx = (ball.x - prevX) / (dt / 1000);
                    ball.vy = (ball.y - prevY) / (dt / 1000);
                    integrateRollOrientation(ball, dt);
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
            ball.sinkingTimer = 600; // ms
            ball.pocketX = pocketEntered.x;
            ball.pocketY = pocketEntered.y;
            ball.sinkingStartX = ball.x;
            ball.sinkingStartY = ball.y;
            ball.elevation = 0;
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
