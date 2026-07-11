import { scaleColorTreeBrightness, shiftColorTreeToTintHex } from "./colorMath.js";
export function stampPropVisualOverride(prop, override) {
    prop.visualOverride = { ...override };
}
export function mergePropVisualOverride(prop, patch) {
    prop.visualOverride = { ...(prop.visualOverride ?? {}), ...patch };
}
export function setPropVisualTint(prop, tintHex) {
    mergePropVisualOverride(prop, { tint: tintHex });
}
export function getPropVisualTint(prop) {
    return prop.visualOverride?.tint ?? null;
}
export function visualOverrideCacheKey(prop) {
    const vo = prop.visualOverride;
    if (!vo) return "";
    let key = "";
    if (vo.tint) key += `t${vo.tint.slice(1).toLowerCase()}`;
    if (vo.brightness != null && vo.brightness !== 1) key += `b${Math.round(vo.brightness * 100)}`;
    return key;
}
export function visualOverrideCacheId(prop) {
    const vo = prop.visualOverride;
    if (!vo) return 0;
    let id = 0;
    if (vo.tint) {
        const hex = vo.tint.charCodeAt(0) === 35 ? vo.tint.slice(1) : vo.tint;
        id = parseInt(hex, 16) || 0;
    }
    if (vo.brightness != null && vo.brightness !== 1) id = (id ^ (Math.round(vo.brightness * 100) * 16777619)) >>> 0;
    return id & 0xfffff;
}
export function resolveVisualOverrideColorTree(prop, colorTree) {
    if (colorTree == null) return colorTree;
    const override = prop.visualOverride;
    if (!override) return colorTree;
    let tree = colorTree;
    if (override.tint) tree = shiftColorTreeToTintHex(tree, override.tint);
    if (override.brightness != null && override.brightness !== 1) tree = scaleColorTreeBrightness(tree, override.brightness);
    return tree;
}
export function serializeVisualOverride(prop) {
    if (!prop.visualOverride) return null;
    const out = {};
    if (prop.visualOverride.tint) out.tint = prop.visualOverride.tint;
    if (prop.visualOverride.brightness != null && prop.visualOverride.brightness !== 1) out.brightness = prop.visualOverride.brightness;
    return Object.keys(out).length ? out : null;
}
