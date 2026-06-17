import { getSandboxEntityMeta } from "../../GameState/sandboxEntityMeta.js";
/** @typedef {"off" | "normal" | "debug"} SandboxPathVisual */
/** @typedef {"default" | "vector"} SandboxPropVisual */
export const SANDBOX_PATH_VISUAL_OFF = "off";
export const SANDBOX_PATH_VISUAL_NORMAL = "normal";
export const SANDBOX_PATH_VISUAL_DEBUG = "debug";
export const SANDBOX_PATH_VISUAL_OPTIONS = [SANDBOX_PATH_VISUAL_OFF, SANDBOX_PATH_VISUAL_NORMAL, SANDBOX_PATH_VISUAL_DEBUG];
export const SANDBOX_PATH_VISUAL_LABELS = { off: "Off", normal: "Normal", debug: "Debug" };
export const SANDBOX_PROP_VISUAL_DEFAULT = "default";
export const SANDBOX_PROP_VISUAL_VECTOR = "vector";
export const SANDBOX_PROP_VISUAL_OPTIONS = [SANDBOX_PROP_VISUAL_DEFAULT, SANDBOX_PROP_VISUAL_VECTOR];
export const SANDBOX_PROP_VISUAL_LABELS = { default: "Default", vector: "Vector" };
/** @param {object} state @param {object} prop @returns {SandboxPathVisual} */
export function resolveSandboxPathVisual(state, prop) {
    return getSandboxEntityMeta(state).getPathVisual(prop.id) ?? SANDBOX_PATH_VISUAL_NORMAL;
}
/** @param {object} state @param {object} prop @param {SandboxPathVisual} visual */
export function setSandboxPathVisual(state, prop, visual) {
    getSandboxEntityMeta(state).setPathVisual(prop.id, visual);
}
/** @param {object} state @param {object} prop @returns {SandboxPropVisual} */
export function resolveSandboxPropVisual(state, prop) {
    return getSandboxEntityMeta(state).getPropVisual(prop.id) ?? SANDBOX_PROP_VISUAL_DEFAULT;
}
/** @param {object} state @param {object} prop @param {SandboxPropVisual} visual */
export function setSandboxPropVisual(state, prop, visual) {
    getSandboxEntityMeta(state).setPropVisual(prop.id, visual);
}
