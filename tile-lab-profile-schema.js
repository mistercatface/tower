/** Motif field metadata for the tile lab profile editor. */

export const LAYER_OPTIONS = [
    { id: "underlay", label: "Underlay" },
    { id: "structure", label: "Structure" },
    { id: "accents", label: "Accents" },
    { id: "floor", label: "Floor only" },
    { id: "wall", label: "Wall only" },
    { id: "shared", label: "Shared" },
];

export const BLEND_OPTIONS = ["add", "multiply", "replace"];

export const MOTIF_TYPES = {
    baseMetal: {
        label: "Base metal",
        defaults: {
            type: "baseMetal",
            structure: { frequency: 0.0025, octaves: 1, rgbDelta: [3, 3, 4] },
            grain: { frequency: 0.18, octaves: 1, amplitude: 1 },
            opacity: 1,
            blendMode: "add",
        },
        fields: [
            { path: "structure.frequency", label: "Structure freq", min: 0.0005, max: 0.02, step: 0.0005 },
            { path: "structure.octaves", label: "Structure octaves", min: 1, max: 4, step: 1 },
            { path: "structure.rgbDelta.0", label: "Struct R Δ", min: -12, max: 12, step: 1 },
            { path: "structure.rgbDelta.1", label: "Struct G Δ", min: -12, max: 12, step: 1 },
            { path: "structure.rgbDelta.2", label: "Struct B Δ", min: -12, max: 12, step: 1 },
            { path: "grain.frequency", label: "Grain freq", min: 0.05, max: 2, step: 0.05 },
            { path: "grain.amplitude", label: "Grain amp", min: 0, max: 6, step: 0.5 },
            { path: "opacity", label: "Opacity", min: 0, max: 1, step: 0.05 },
        ],
    },
    deckPlates: {
        label: "Deck plates",
        defaults: {
            type: "deckPlates",
            cellWorldSize: 16,
            plateCells: 2,
            plateRows: 2,
            groutWidth: 0.045,
            groutPeak: 11,
            groutTint: [-6, -6, -5],
            plateVariation: 3,
            jitterOffset: [0, 0],
            rivetSpacing: 16,
            rivetInset: 4,
            rivetRadius: 0.018,
            rivetPeak: 5,
            rivetTint: [2, 4, 5],
            blendMode: "multiply",
            opacity: 0.85,
        },
        fields: [
            { path: "cellWorldSize", label: "Cell world px", min: 8, max: 64, step: 1 },
            { path: "plateCells", label: "Plate cells (W)", min: 1, max: 8, step: 1 },
            { path: "plateRows", label: "Plate cells (H)", min: 1, max: 8, step: 1 },
            { path: "groutWidth", label: "Grout width", min: 0.01, max: 0.15, step: 0.005 },
            { path: "groutPeak", label: "Grout peak", min: 0, max: 20, step: 1 },
            { path: "plateVariation", label: "Plate jitter", min: 0, max: 10, step: 0.5 },
            { path: "rivetSpacing", label: "Rivet spacing (0=off)", min: 0, max: 32, step: 1 },
            { path: "rivetPeak", label: "Rivet peak", min: 0, max: 12, step: 1 },
            { path: "opacity", label: "Opacity", min: 0, max: 1, step: 0.05 },
        ],
    },
    stainBlotch: {
        label: "Stain blotch",
        defaults: {
            type: "stainBlotch",
            coordinateSpace: "eval",
            frequency: 0.008,
            threshold: 0.55,
            peak: 5,
            offset: [0, 0],
            tint: [1, 2, 2],
            octaves: 1,
            opacity: 0.15,
            blendMode: "add",
        },
        fields: [
            { path: "frequency", label: "Frequency", min: 0.002, max: 0.05, step: 0.001 },
            { path: "threshold", label: "Threshold", min: 0, max: 0.9, step: 0.05 },
            { path: "peak", label: "Peak", min: 0, max: 20, step: 1 },
            { path: "opacity", label: "Opacity", min: 0, max: 1, step: 0.05 },
        ],
    },
    wallLighting: {
        label: "Wall lighting",
        defaults: {
            type: "wallLighting",
            power: 1,
            topDarken: 4,
            coolBias: 1.04,
            opacity: 1,
            blendMode: "multiply",
        },
        fields: [
            { path: "power", label: "Power", min: 0.2, max: 2, step: 0.05 },
            { path: "topDarken", label: "Top darken", min: 0, max: 20, step: 1 },
            { path: "coolBias", label: "Cool bias", min: 0.8, max: 1.3, step: 0.02 },
            { path: "opacity", label: "Opacity", min: 0, max: 1, step: 0.05 },
        ],
    },
    ridgeLines: {
        label: "Ridge lines",
        defaults: {
            type: "ridgeLines",
            coordinateSpace: "eval",
            frequency: 0.02,
            threshold: 0.1,
            peak: 8,
            offset: [0, 0],
            tint: [0.2, 0.8, 1.2],
            octaves: 2,
            ridged: true,
            opacity: 0.35,
            blendMode: "add",
        },
        fields: [
            { path: "frequency", label: "Frequency", min: 0.005, max: 0.06, step: 0.001 },
            { path: "threshold", label: "Threshold", min: 0, max: 0.3, step: 0.01 },
            { path: "peak", label: "Peak", min: 0, max: 20, step: 1 },
            { path: "opacity", label: "Opacity", min: 0, max: 1, step: 0.05 },
        ],
    },
    panelGrid: {
        label: "Panel grid (legacy)",
        defaults: {
            type: "panelGrid",
            cellWorldSize: 16,
            groutWidth: 0.06,
            peak: 8,
            tint: [-4, -4, -3],
            variationFrequency: 0.1,
            variationAmplitude: 1,
            opacity: 0.7,
            blendMode: "multiply",
        },
        fields: [
            { path: "cellWorldSize", label: "Cell world px", min: 8, max: 64, step: 1 },
            { path: "groutWidth", label: "Grout width", min: 0.01, max: 0.2, step: 0.005 },
            { path: "peak", label: "Peak", min: 0, max: 20, step: 1 },
            { path: "opacity", label: "Opacity", min: 0, max: 1, step: 0.05 },
        ],
    },
};

export const WARP_FIELDS = [
    { path: "warp.frequency", label: "Warp frequency", min: 0, max: 0.02, step: 0.0005 },
    { path: "warp.amplitude", label: "Warp amplitude", min: 0, max: 20, step: 1 },
    { path: "warp.octaves", label: "Warp octaves", min: 1, max: 4, step: 1 },
];

export const PALETTE_FIELDS = [
    { path: "palette.floorBase.0", label: "Floor R", min: 0, max: 64, step: 1 },
    { path: "palette.floorBase.1", label: "Floor G", min: 0, max: 64, step: 1 },
    { path: "palette.floorBase.2", label: "Floor B", min: 0, max: 64, step: 1 },
    { path: "palette.wallBase.0", label: "Wall R", min: 0, max: 64, step: 1 },
    { path: "palette.wallBase.1", label: "Wall G", min: 0, max: 64, step: 1 },
    { path: "palette.wallBase.2", label: "Wall B", min: 0, max: 64, step: 1 },
];
