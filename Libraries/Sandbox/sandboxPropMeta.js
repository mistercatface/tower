import { SANDBOX_PATH_VISUAL_OPTIONS, SANDBOX_PATH_VISUAL_NORMAL, SANDBOX_PATH_VISUAL_OFF } from "./sandboxPathVisual.js";
import { getSandboxEntityMeta } from "./sandboxEntityMeta.js";
/** @typedef {import("./sandboxPathVisual.js").SandboxPathVisual} SandboxPathVisual */
/** @param {object} state @param {object | null | undefined} prop @returns {SandboxPathVisual} */
export function resolveSandboxPathVisual(state, prop) {
    if (!prop) return SANDBOX_PATH_VISUAL_OFF;
    const value = getSandboxEntityMeta(state).getPathVisual(prop.id);
    return SANDBOX_PATH_VISUAL_OPTIONS.includes(value) ? value : SANDBOX_PATH_VISUAL_NORMAL;
}
/** @param {object} state @param {object} prop @param {SandboxPathVisual} visual */
export function setSandboxPathVisual(state, prop, visual) {
    getSandboxEntityMeta(state).setPathVisual(prop.id, SANDBOX_PATH_VISUAL_OPTIONS.includes(visual) ? visual : SANDBOX_PATH_VISUAL_OFF);
}
