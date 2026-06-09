/** @typedef {"off" | "normal" | "debug"} SandboxPathVisual */
export const SANDBOX_PATH_VISUAL_OFF = "off";
export const SANDBOX_PATH_VISUAL_NORMAL = "normal";
export const SANDBOX_PATH_VISUAL_DEBUG = "debug";
export const SANDBOX_PATH_VISUAL_OPTIONS = [SANDBOX_PATH_VISUAL_OFF, SANDBOX_PATH_VISUAL_NORMAL, SANDBOX_PATH_VISUAL_DEBUG];
export const SANDBOX_PATH_VISUAL_LABELS = {
    off: "Off",
    normal: "Normal",
    debug: "Debug",
};
/** @param {object | null | undefined} pickup @returns {SandboxPathVisual} */
export function resolveSandboxPathVisual(pickup) {
    const value = pickup?.sandboxPathVisual;
    return SANDBOX_PATH_VISUAL_OPTIONS.includes(value) ? value : SANDBOX_PATH_VISUAL_NORMAL;
}
/** @param {object} pickup @param {SandboxPathVisual} visual */
export function setSandboxPathVisual(pickup, visual) {
    pickup.sandboxPathVisual = SANDBOX_PATH_VISUAL_OPTIONS.includes(visual) ? visual : SANDBOX_PATH_VISUAL_OFF;
}
