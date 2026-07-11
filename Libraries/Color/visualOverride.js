import { scaleColorTreeBrightness, scaleHexBrightness, collectHexColors, shiftColorTreeToTintHex, shiftPaletteToTintHex, hueToPickerHex, normalizeHue } from "./colorMath.js";
export function stampPropVisualOverride(prop, override) {
    prop.visualOverride = { ...override };
}
export function mergePropVisualOverride(prop, patch) {
    prop.visualOverride = { ...(prop.visualOverride ?? {}), ...patch };
}
export function clearPropVisualOverride(prop) {
    delete prop.visualOverride;
}
export function setPropVisualTint(prop, tintHex) {
    mergePropVisualOverride(prop, { tint: tintHex });
}
export function setPropVisualBrightness(prop, brightness) {
    mergePropVisualOverride(prop, { brightness });
}
export function getPropVisualTint(prop) {
    return prop.visualOverride?.tint ?? null;
}
export function getPropVisualBrightness(prop) {
    return prop.visualOverride?.brightness ?? 1;
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
function resolveHexListOverride(hexes, override) {
    let out = hexes;
    if (override?.tint) out = shiftPaletteToTintHex(out, override.tint);
    if (override?.brightness != null && override.brightness !== 1) out = out.map((hex) => scaleHexBrightness(hex, override.brightness));
    return out;
}
export function resolveVisualOverridePanels(prop, assetPanels) {
    return resolveHexListOverride(assetPanels, prop.visualOverride);
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
export function assetHasTintableColors(asset) {
    if (asset.visuals?.panels?.length) return true;
    const hexes = [];
    collectHexColors(asset.visuals?.colors, hexes);
    return hexes.length > 0;
}
export function sampleAssetBaseTintHex(asset) {
    const panels = asset.visuals?.panels;
    if (panels?.[0]) return panels[0];
    const hexes = [];
    collectHexColors(asset.visuals?.colors, hexes);
    return hexes[0] ?? "#888888";
}
export function resolvePickerHex(prop, asset) {
    if (prop.visualOverride?.tint) return prop.visualOverride.tint;
    return sampleAssetBaseTintHex(asset);
}
export function randomVisualTintHex(rng = Math.random) {
    return hueToPickerHex(normalizeHue(rng() * 360));
}
export function serializeVisualOverride(prop) {
    if (!prop.visualOverride) return null;
    const out = {};
    if (prop.visualOverride.tint) out.tint = prop.visualOverride.tint;
    if (prop.visualOverride.brightness != null && prop.visualOverride.brightness !== 1) out.brightness = prop.visualOverride.brightness;
    return Object.keys(out).length ? out : null;
}
export const PUZZLE_TEMPLATE_BALL_TINTS = { roomA: "#42A5F5", roomB: "#FF9800" };
export const PIPE_SPAWNER_BALL_TINT = "#42A5F5";
