import { formatSandboxSpawnLabel } from "../../Props/PropCatalog.js";
import { sandboxAssetTags } from "../../Sandbox/sandboxCapabilities.js";
import propCatalog from "../../../Assets/props/index.js";
export const SANDBOX_PALETTE_TAG_FILTERS = [
    { id: "all", label: "All" },
    { id: "shapes", label: "Shapes" },
    { id: "nav", label: "Nav" },
    { id: "gen", label: "Gen" },
    { id: "rooms", label: "Rooms" },
];
const PLACE_PALETTE_TAGS_BY_KEY = { "wall:voxel": ["gen"], "wall:rail": ["gen"], "gen:cavern": ["gen"], "gen:rail": ["gen"], "gen:railMaze": ["gen"], "gen:erase": ["gen"] };
function resolvePlacePaletteTags(paletteKey, asset = null) {
    const keyed = PLACE_PALETTE_TAGS_BY_KEY[paletteKey];
    if (keyed) return keyed;
    if (paletteKey.startsWith("prop:")) return sandboxAssetTags(asset ?? propCatalog[paletteKey.slice(5)]);
    return [];
}
export function sandboxTagFilterLabel(filterId) {
    const option = SANDBOX_PALETTE_TAG_FILTERS.find((entry) => entry.id === filterId);
    return option?.label.toLowerCase() ?? filterId;
}
const WALL_STAMP_OPTIONS = [
    { value: "voxel", label: "Voxel block" },
    { value: "rail", label: "Rail wall" },
    { value: "forcefield", label: "Forcefield" },
];
const WALL_PALETTE_SWATCHES = { voxel: "#78716c", rail: "#57534e", forcefield: "#0891b2" };
const MAP_GEN_PALETTE_OPTIONS = [
    { key: "gen:cavern", genKind: "cavern", label: "Cavern generation", swatch: "#ff9800", glyph: "Cv" },
    { key: "gen:rail", genKind: "rail", label: "Rail wall generation", swatch: "#e040fb", glyph: "Rw" },
    { key: "gen:railMaze", genKind: "railMaze", label: "Rail maze generation", swatch: "#ba68c8", glyph: "Rz" },
    { key: "gen:erase", genKind: "erase", label: "Wall eraser", swatch: "#f44336", glyph: "Er" },
];
function resolvePropPaletteSwatch(asset) {
    const colors = asset?.visuals?.colors;
    return colors?.bodyInspect ?? colors?.top ?? colors?.side ?? "#64748b";
}
export function buildPlacePaletteItems(propIds) {
    const items = [];
    for (let i = 0; i < propIds.length; i++) {
        const id = propIds[i];
        const asset = propCatalog[id];
        const label = formatSandboxSpawnLabel(id);
        const key = `prop:${id}`;
        items.push({ key, kind: "prop", label, swatch: resolvePropPaletteSwatch(asset), glyph: label.slice(0, 2), tags: resolvePlacePaletteTags(key, asset) });
    }
    for (let i = 0; i < WALL_STAMP_OPTIONS.length; i++) {
        const option = WALL_STAMP_OPTIONS[i];
        const key = `wall:${option.value}`;
        items.push({ key, kind: "wall", label: option.label, swatch: WALL_PALETTE_SWATCHES[option.value], glyph: option.label.slice(0, 1), tags: resolvePlacePaletteTags(key) });
    }
    for (let i = 0; i < MAP_GEN_PALETTE_OPTIONS.length; i++) {
        const option = MAP_GEN_PALETTE_OPTIONS[i];
        items.push({ key: option.key, kind: "gen", genKind: option.genKind, label: option.label, swatch: option.swatch, glyph: option.glyph, tags: resolvePlacePaletteTags(option.key) });
    }
    items.sort((a, b) => a.label.localeCompare(b.label));
    return items;
}
export function appendSandboxTagFilters(head, activeFilter, onChange, ariaLabel = "Tag filters") {
    const row = document.createElement("div");
    row.className = "sandbox-palette-filter-group";
    row.setAttribute("role", "radiogroup");
    row.setAttribute("aria-label", ariaLabel);
    for (let i = 0; i < SANDBOX_PALETTE_TAG_FILTERS.length; i++) {
        const option = SANDBOX_PALETTE_TAG_FILTERS[i];
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "sandbox-palette-filter-btn";
        btn.textContent = option.label;
        btn.setAttribute("role", "radio");
        const active = activeFilter === option.id;
        btn.setAttribute("aria-checked", String(active));
        btn.classList.toggle("is-active", active);
        btn.addEventListener("click", () => {
            if (activeFilter !== option.id) onChange(option.id);
        });
        row.appendChild(btn);
    }
    head.appendChild(row);
}
export function appendSpawnPaletteGrid(parent, items, activeKey, onSelect) {
    const grid = document.createElement("div");
    grid.className = "spawn-palette-grid";
    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "spawn-palette-tile";
        btn.setAttribute("aria-pressed", String(item.key === activeKey));
        if (item.key === activeKey) btn.classList.add("is-active");
        const icon = document.createElement("div");
        icon.className = "spawn-palette-icon";
        icon.style.setProperty("--swatch", item.swatch);
        icon.textContent = item.glyph;
        const label = document.createElement("span");
        label.className = "spawn-palette-label";
        label.textContent = item.label;
        btn.append(icon, label);
        btn.addEventListener("click", () => onSelect(item.key));
        grid.appendChild(btn);
    }
    parent.appendChild(grid);
}
