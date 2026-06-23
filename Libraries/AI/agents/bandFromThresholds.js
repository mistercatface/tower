/** @param {number | null | undefined} value @param {{ id: string, min: number }[]} bands highest `min` first */
export function bandFromThresholds(value, bands) {
    if (value == null || !bands?.length) return null;
    for (let i = 0; i < bands.length; i++) if (value >= bands[i].min) return bands[i].id;
    return bands[bands.length - 1].id;
}

export function lookupBandTable(table, bandId, fallbackBandId = "hungry") {
    const key = bandId ?? fallbackBandId;
    if (table[key] != null) return table[key];
    return table[fallbackBandId] ?? 0;
}

export const DEFAULT_HUNGER_BANDS = Object.freeze([
    { id: "satisfied", min: 0.66 },
    { id: "hungry", min: 0.33 },
    { id: "desperate", min: 0 },
]);
