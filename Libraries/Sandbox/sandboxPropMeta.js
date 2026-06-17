import { SANDBOX_PATH_VISUAL_OPTIONS, SANDBOX_PATH_VISUAL_NORMAL, SANDBOX_PATH_VISUAL_OFF } from "./sandboxPathVisual.js";
import { SANDBOX_PROP_VISUAL_DEFAULT, SANDBOX_PROP_VISUAL_OPTIONS } from "./sandboxPropVisual.js";
import { getSandboxEntityMeta } from "../../GameState/sandboxEntityMeta.js";
/** @typedef {import("./sandboxPathVisual.js").SandboxPathVisual} SandboxPathVisual */
/** @typedef {import("./sandboxPropVisual.js").SandboxPropVisual} SandboxPropVisual */
/** @param {object} state @param {object} prop @returns {SandboxPathVisual} */
export function resolveSandboxPathVisual(state, prop) {
    const value = getSandboxEntityMeta(state).getPathVisual(prop.id);
    return SANDBOX_PATH_VISUAL_OPTIONS.includes(value) ? value : SANDBOX_PATH_VISUAL_NORMAL;
}
/** @param {object} state @param {object} prop @param {SandboxPathVisual} visual */
export function setSandboxPathVisual(state, prop, visual) {
    getSandboxEntityMeta(state).setPathVisual(prop.id, SANDBOX_PATH_VISUAL_OPTIONS.includes(visual) ? visual : SANDBOX_PATH_VISUAL_OFF);
}
/** @param {object} state @param {object} prop @returns {SandboxPropVisual} */
export function resolveSandboxPropVisual(state, prop) {
    const value = getSandboxEntityMeta(state).getPropVisual(prop.id);
    return SANDBOX_PROP_VISUAL_OPTIONS.includes(value) ? value : SANDBOX_PROP_VISUAL_DEFAULT;
}
/** @param {object} state @param {object} prop @param {SandboxPropVisual} visual */
export function setSandboxPropVisual(state, prop, visual) {
    getSandboxEntityMeta(state).setPropVisual(prop.id, SANDBOX_PROP_VISUAL_OPTIONS.includes(visual) ? visual : SANDBOX_PROP_VISUAL_DEFAULT);
}
