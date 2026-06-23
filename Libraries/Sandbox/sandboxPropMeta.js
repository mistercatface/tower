import { getSandboxEntityMeta } from "../../GameState/sandboxEntityMeta.js";
/** @typedef {"off" | "normal" | "debug"} SandboxPathVisual */
export const SANDBOX_PATH_VISUAL_OFF = "off";
export const SANDBOX_PATH_VISUAL_NORMAL = "normal";
export const SANDBOX_PATH_VISUAL_DEBUG = "debug";
export const SANDBOX_PATH_VISUAL_OPTIONS = [SANDBOX_PATH_VISUAL_OFF, SANDBOX_PATH_VISUAL_NORMAL, SANDBOX_PATH_VISUAL_DEBUG];
export const SANDBOX_PATH_VISUAL_LABELS = { off: "Off", normal: "Normal", debug: "Debug" };
/** @param {object} state @param {object} prop @returns {SandboxPathVisual} */
export function resolveSandboxPathVisual(state, prop) {
    return getSandboxEntityMeta(state).getPathVisual(prop.id) ?? SANDBOX_PATH_VISUAL_NORMAL;
}
/** @param {object} state @param {object} prop @param {SandboxPathVisual} visual */
export function setSandboxPathVisual(state, prop, visual) {
    getSandboxEntityMeta(state).setPathVisual(prop.id, visual);
}
