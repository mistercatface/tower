import { wakePushableBody } from "../../Libraries/Motion/pushableSleep.js";
import { MAX_SHOT_POWER, SHOT_POWER_SCALE, MIN_AIM_DRAG, CUE_GRAB_RADIUS_PAD } from "./config/tableLayout.js";
import { getCueBall, ensurePoolState, allBallsStopped } from "./balls.js";
/**
 * @param {object} cue
 * @param {number} worldX
 * @param {number} worldY
 */
export function pointerNearCueBall(cue, worldX, worldY) {
    const dx = worldX - cue.x;
    const dy = worldY - cue.y;
    const grab = cue.radius + CUE_GRAB_RADIUS_PAD;
    return dx * dx + dy * dy <= grab * grab;
}
/**
 * @param {object} state
 */
export function canBeginAim(state) {
    const pool = ensurePoolState(state);
    if (pool.phase !== "aiming" || pool.won) return false;
    return allBallsStopped(state);
}
/**
 * Begin aim anchored on the cue ball. Any table tap works — pull vector updates on drag.
 *
 * @param {object} state
 * @returns {boolean}
 */
export function tryBeginAim(state) {
    if (!canBeginAim(state)) return false;
    const cue = getCueBall(state);
    if (!cue) return false;
    const pool = ensurePoolState(state);
    pool.aim = { active: true, pullX: cue.x, pullY: cue.y };
    return true;
}
/**
 * @param {object} state
 * @param {number} worldX
 * @param {number} worldY
 */
export function updateAim(state, worldX, worldY) {
    const pool = ensurePoolState(state);
    if (!pool.aim?.active) return;
    pool.aim.pullX = worldX;
    pool.aim.pullY = worldY;
}
/**
 * @param {object} state
 * @returns {boolean} true if a shot was fired
 */
export function releaseAimShot(state) {
    const pool = ensurePoolState(state);
    const aim = pool.aim;
    pool.aim = null;
    if (!aim?.active) return false;
    const cue = getCueBall(state);
    if (!cue) return false;
    const dx = aim.pullX - cue.x;
    const dy = aim.pullY - cue.y;
    const drag = Math.hypot(dx, dy);
    if (drag < MIN_AIM_DRAG) return false;
    const power = Math.min(MAX_SHOT_POWER, drag * SHOT_POWER_SCALE);
    const nx = -dx / drag;
    const ny = -dy / drag;
    cue.vx = nx * power;
    cue.vy = ny * power;
    wakePushableBody(cue);
    pool.phase = "rolling";
    return true;
}
/**
 * @param {object} state
 * @returns {{ nx: number, ny: number, power: number, drag: number } | null}
 */
export function getAimPreview(state) {
    const pool = ensurePoolState(state);
    if (!pool.aim?.active) return null;
    const cue = getCueBall(state);
    if (!cue) return null;
    const dx = pool.aim.pullX - cue.x;
    const dy = pool.aim.pullY - cue.y;
    const drag = Math.hypot(dx, dy);
    if (drag < 1) return null;
    return { nx: -dx / drag, ny: -dy / drag, power: Math.min(MAX_SHOT_POWER, drag * SHOT_POWER_SCALE), drag };
}
