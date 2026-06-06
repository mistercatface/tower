import { Pickup } from "../../Entities/Pickup.js";
import { wakePushableBody } from "../../Libraries/Motion/pushableSleep.js";
import { BALL_STOPPED_SPEED_SQ } from "./config/tableLayout.js";

export const POOL_CUE_TAG = "_poolCue";
export const POOL_OBJECT_TAG = "_poolObject";

/**
 * @param {object} state
 */
export function ensurePoolState(state) {
    if (!state.pool) {
        state.pool = {
            phase: "aiming",
            objectRemaining: 2,
            won: false,
            aim: null,
        };
    }
    return state.pool;
}

/**
 * @param {object} state
 * @returns {object | null}
 */
export function getCueBall(state) {
    if (!state?.pickups) return null;
    for (let i = 0; i < state.pickups.length; i++) {
        const ball = state.pickups[i];
        if (!ball.isDead && ball[POOL_CUE_TAG]) return ball;
    }
    return null;
}

/**
 * @param {object} state
 * @returns {object[]}
 */
export function getActiveBalls(state) {
    if (!state?.pickups) return [];
    const out = [];
    for (let i = 0; i < state.pickups.length; i++) {
        const ball = state.pickups[i];
        if (!ball.isDead && (ball[POOL_CUE_TAG] || ball[POOL_OBJECT_TAG])) {
            out.push(ball);
        }
    }
    return out;
}

/**
 * @param {object} state
 */
export function allBallsStopped(state) {
    const balls = getActiveBalls(state);
    for (let i = 0; i < balls.length; i++) {
        const b = balls[i];
        const vx = b.vx ?? 0;
        const vy = b.vy ?? 0;
        if (vx * vx + vy * vy > BALL_STOPPED_SPEED_SQ) return false;
    }
    return balls.length > 0;
}

/**
 * @param {object} state
 * @param {object} layout
 */
export function spawnPoolBalls(state, layout) {
    if (!state.pickups || !layout?.ballSpawns) return;

    const specs = [
        { type: "pool_cue_ball", pos: layout.ballSpawns.cue, tag: POOL_CUE_TAG },
        { type: "pool_object_ball", pos: layout.ballSpawns.object1, tag: POOL_OBJECT_TAG },
        { type: "pool_object_ball", pos: layout.ballSpawns.object2, tag: POOL_OBJECT_TAG },
    ];

    for (const spec of specs) {
        const ball = new Pickup(spec.pos.x, spec.pos.y, spec.type, 0);
        ball[spec.tag] = true;
        wakePushableBody(ball);
        state.pickups.push(ball);
    }

    const pool = ensurePoolState(state);
    pool.objectRemaining = 2;
    pool.phase = "aiming";
    pool.won = false;
}

/**
 * @param {object} state
 * @param {object} layout
 */
export function respotCueBall(state, layout) {
    const cue = getCueBall(state);
    const spot = layout?.ballSpawns?.cue ?? layout?.spawnSlots?.head;
    if (!cue || !spot) return;
    cue.x = spot.x;
    cue.y = spot.y;
    cue.vx = 0;
    cue.vy = 0;
    cue.angularVelocity = 0;
    cue.isSleeping = false;
    wakePushableBody(cue);
}
