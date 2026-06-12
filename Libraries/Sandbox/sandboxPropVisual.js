/** @typedef {"default" | "vector"} SandboxPropVisual */
export const SANDBOX_PROP_VISUAL_DEFAULT = "default";
export const SANDBOX_PROP_VISUAL_VECTOR = "vector";
export const SANDBOX_PROP_VISUAL_OPTIONS = [SANDBOX_PROP_VISUAL_DEFAULT, SANDBOX_PROP_VISUAL_VECTOR];
export const SANDBOX_PROP_VISUAL_LABELS = { default: "Default", vector: "Vector" };
export { resolveSandboxPropVisual, setSandboxPropVisual } from "./sandboxPropMeta.js";
