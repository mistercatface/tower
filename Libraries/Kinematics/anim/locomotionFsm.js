import { clamp } from "../../Math/Interpolate.js";
/** @typedef {"unarmed_idle" | "unarmed_walk" | "armed_idle" | "armed_walk"} LocomotionLabel */
/**
 * @param {boolean} hasWeapons
 * @param {boolean} isWalking
 * @returns {LocomotionLabel}
 */
export function resolveLocomotionLabel(hasWeapons, isWalking) {
    if (hasWeapons) return isWalking ? "armed_walk" : "armed_idle";
    return isWalking ? "unarmed_walk" : "unarmed_idle";
}
/**
 * @param {ReturnType<import("./animState.js").createEntityAnimState>} state
 * @param {LocomotionLabel} nextLabel
 * @param {Record<LocomotionLabel, LocomotionState>} states
 */
function transitionLocomotionLabel(state, nextLabel, states) {
    if (state.locomotionLabel === nextLabel) return;
    states[state.locomotionLabel]?.onExit?.(state);
    state.locomotionLabel = nextLabel;
    states[nextLabel]?.onEnter?.(state);
}
/**
 * @typedef {object} LocomotionState
 * @property {(state: object) => void} [onEnter]
 * @property {(state: object) => void} [onExit]
 * @property {(state: object, dtSec: number, ctx: object) => void} update
 */
/**
 * @param {{ poses: Record<string, object>, resolveWeaponStaticPoseName: (actor: object) => string }} deps
 */
export function createLocomotionFsm({ poses, resolveWeaponStaticPoseName }) {
    /** @type {Record<LocomotionLabel, LocomotionState>} */
    const states = {
        armed_idle: {
            onEnter(state) {
                state.poseFactor = 0;
            },
            update(state, dtSec, ctx) {
                const { actor, targetPoseFactor, transitionSpeed } = ctx;
                state.legPoseFactor += (targetPoseFactor - state.legPoseFactor) * dtSec * transitionSpeed;
                state.legPoseFactor = clamp(state.legPoseFactor, 0, 1);
                const weaponPose = poses[resolveWeaponStaticPoseName(actor)] ?? poses.IDLE;
                state.currentStaticPose = weaponPose;
                state.lastStaticPose = weaponPose;
                state.staticBlendFactor = 1;
                state.pose = weaponPose.name;
            },
        },
        armed_walk: {
            onEnter(state) {
                state.poseFactor = 0;
            },
            update(state, dtSec, ctx) {
                const { actor, targetPoseFactor, transitionSpeed } = ctx;
                state.legPoseFactor += (targetPoseFactor - state.legPoseFactor) * dtSec * transitionSpeed;
                state.legPoseFactor = clamp(state.legPoseFactor, 0, 1);
                const weaponPose = poses[resolveWeaponStaticPoseName(actor)] ?? poses.IDLE;
                state.currentStaticPose = weaponPose;
                state.lastStaticPose = weaponPose;
                state.staticBlendFactor = 1;
                state.pose = weaponPose.name;
            },
        },
        unarmed_idle: {
            onEnter(state) {
                state.legPoseFactor = 0;
            },
            update(state, dtSec, ctx) {
                const { targetPoseFactor, transitionSpeed } = ctx;
                state.poseFactor += (targetPoseFactor - state.poseFactor) * dtSec * transitionSpeed;
                state.poseFactor = clamp(state.poseFactor, 0, 1);
                const idlePose = poses.IDLE;
                if (state.currentStaticPose !== idlePose) {
                    state.lastStaticPose = state.currentStaticPose;
                    state.currentStaticPose = idlePose;
                    state.staticBlendFactor = 0;
                } else state.staticBlendFactor = clamp(state.staticBlendFactor + dtSec / 0.75, 0, 1);
                state.pose = idlePose.name;
            },
        },
        unarmed_walk: {
            onEnter(state) {
                state.legPoseFactor = 0;
            },
            update(state, dtSec, ctx) {
                const { targetPoseFactor, transitionSpeed } = ctx;
                state.poseFactor += (targetPoseFactor - state.poseFactor) * dtSec * transitionSpeed;
                state.poseFactor = clamp(state.poseFactor, 0, 1);
                state.staticBlendFactor = 1;
                state.currentStaticPose = poses.IDLE;
                state.lastStaticPose = poses.IDLE;
                state.pose = "WALK";
            },
        },
    };
    return {
        states,
        /**
         * @param {ReturnType<import("./animState.js").createEntityAnimState>} state
         * @param {number} dtSec
         * @param {object} ctx
         */
        tick(state, dtSec, ctx) {
            const label = resolveLocomotionLabel(ctx.hasWeapons, ctx.isWalking);
            transitionLocomotionLabel(state, label, states);
            states[label].update(state, dtSec, ctx);
        },
        isLocomoting(state) {
            const label = state.locomotionLabel;
            if (label === "armed_idle" || label === "armed_walk") return state.legPoseFactor > 0.1;
            return state.poseFactor > 0.1;
        },
    };
}
