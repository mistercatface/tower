export const combatVisualSettings = {
    floorHighlight: "#2c3340",
    floorFill: "#1c2129",
    floorShadow: "#12161c",
    gridStroke: "rgba(90, 105, 125, 0.2)",
    bloom: {
        enabled: true,
        blur: 2,
    },
};

/** Classic circle + turret HUD (H cycles modes). */
export const COMBAT_HUD_MODE = {
    OFF: 0,
    OVERLAY: 1,
    CLASSIC: 2,
};

export const COMBAT_HUD_MODE_COUNT = 3;

export const COMBAT_HUD_MODE_LABELS = ["off", "overlay", "classic"];

export const hudSettings = {
    combatOverlayAlpha: 0.72,
};
