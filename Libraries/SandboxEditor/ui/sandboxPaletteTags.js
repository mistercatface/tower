import { getPropAsset } from "../../Props/PropCatalog.js";
export const SANDBOX_PALETTE_TAG_FILTERS = [
    { id: "all", label: "All" },
    { id: "gen", label: "Gen" },
    { id: "rooms", label: "Rooms" },
];
const PLACE_PALETTE_TAGS_BY_KEY = { "wall:voxel": ["gen"], "wall:rail": ["gen"], "gen:cavern": ["gen"], "gen:rail": ["gen"], "gen:erase": ["gen"] };
/** @param {object | null | undefined} asset */
export function sandboxTagsFromAsset(asset) {
    const tags = asset?.sandbox?.tags;
    if (!Array.isArray(tags)) return [];
    return tags.filter((tag) => typeof tag === "string");
}
/** @param {string} paletteKey @param {object | null | undefined} [asset] */
export function resolvePlacePaletteTags(paletteKey, asset = null) {
    const keyed = PLACE_PALETTE_TAGS_BY_KEY[paletteKey];
    if (keyed) return keyed;
    if (paletteKey.startsWith("prop:")) return sandboxTagsFromAsset(asset ?? getPropAsset(paletteKey.slice(5)));
    return [];
}
/** @param {string} filter @param {readonly string[]} itemTags */
export function sandboxPaletteMatchesFilter(filter, itemTags) {
    if (filter === "all") return true;
    return itemTags.includes(filter);
}
