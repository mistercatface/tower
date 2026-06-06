import { clamp } from "../../Math/Interpolate.js";
import { createLocomotionFsm } from "./locomotionFsm.js";
import { getWeaponLoadoutKey } from "./animState.js";
import { syncWeaponPose } from "./weaponPose.js";
/**
 * @param {ReturnType<import("./animState.js").createEntityAnimState>} state
 * @param {object} actor
 * @param {number} dtSec
 */
export function updateSmoothedSpeed(state, actor, dtSec) {
    const moveDx = actor.x - state.lastX;
    const moveDy = actor.y - state.lastY;
    const dist = Math.hypot(moveDx, moveDy);
    const safeDelta = Math.max(dtSec, 0.001);
    let measuredSpeed = dist / safeDelta;
    if (dist > 80) measuredSpeed = 0;
    state.smoothedSpeed = measuredSpeed < state.smoothedSpeed ? state.smoothedSpeed * 0.2 + measuredSpeed * 0.8 : state.smoothedSpeed * 0.5 + measuredSpeed * 0.5;
    state.lastX = actor.x;
    state.lastY = actor.y;
    return Math.max(0, state.smoothedSpeed);
}
/**
 * @param {object} actor
 */
export function hasMoveIntent(actor) {
    return actor.isMoving || Math.hypot(actor.desiredX ?? 0, actor.desiredY ?? 0) > 0.05 || Math.hypot(actor.vx ?? 0, actor.vy ?? 0) > 2;
}
/**
 * @param {{
 *   poses: Record<string, object>,
 *   config: object,
 *   resolveWeaponStaticPoseName: (actor: object) => string,
 * }} deps
 */
export function createLocomotionTicker(deps) {
    const { poses, config, resolveWeaponStaticPoseName } = deps;
    const fsm = createLocomotionFsm({ poses, resolveWeaponStaticPoseName });
    /**
     * @param {ReturnType<import("./animState.js").createEntityAnimState>} state
     * @param {object} actor
     * @param {number} dtSec
     */
    function tickLocomotion(state, actor, dtSec) {
        const speed = updateSmoothedSpeed(state, actor, dtSec);
        const refSpeed = Math.max(1, actor.baseMoveSpeed ?? actor.speed ?? 50);
        const walkPlayback = clamp(speed / refSpeed, 0, 1.15);
        syncWeaponPose(state, actor, poses, resolveWeaponStaticPoseName, getWeaponLoadoutKey);
        const hasWeapons = getWeaponLoadoutKey(actor) !== "none";
        const isWalking = walkPlayback > 0.12 || hasMoveIntent(actor);
        const targetPoseFactor = isWalking ? 1 : 0;
        const locomotionBlend = hasWeapons ? state.legPoseFactor : state.poseFactor;
        const transitionSpeed = locomotionBlend > 0.5 ? 3 : 1.5;
        fsm.tick(state, dtSec, { actor, hasWeapons, isWalking, targetPoseFactor, transitionSpeed });
        const locomoting = fsm.isLocomoting(state);
        const cycleSpeed = locomoting ? config.STRIDE_SPEED : config.IDLE_SPEED;
        const playbackSpeed = locomoting ? walkPlayback * (config.WALK_PLAYBACK_SCALE ?? 1) : 1;
        state.animCycle += playbackSpeed * dtSec * cycleSpeed;
        return state;
    }
    return { tickLocomotion, fsm };
}
