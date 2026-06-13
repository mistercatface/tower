/** Default flipper body dimensions in world units (overridable per asset via `flipper.length`, etc.). */
export const FLIPPER_LAYOUT = { length: 16, width: 4, height: 5, pivotRadius: 2.5 };
export const FLIPPER_COLORS = {
    side: { shadow: "#455A64", mid: "#607D8B", highlight: "#90A4AE" },
    top: { light: "#78909C", mid: "#607D8B", dark: "#455A64" },
    bottom: { light: "#37474F", mid: "#263238", dark: "#1a1a1a" },
    tip: { shadow: "#546E7A", mid: "#78909C", highlight: "#B0BEC5" },
    pivot: { shadow: "#37474F", mid: "#546E7A", highlight: "#78909C" },
    stroke: "#263238",
};
export const FLIPPER_ACTIVE_COLORS = {
    side: { shadow: "#B71C1C", mid: "#E53935", highlight: "#EF5350" },
    top: { light: "#EF5350", mid: "#E53935", dark: "#C62828" },
    bottom: { light: "#8E0000", mid: "#6A0404", dark: "#4A0000" },
    tip: { shadow: "#C62828", mid: "#EF5350", highlight: "#FF8A80" },
    pivot: { shadow: "#8E0000", mid: "#C62828", highlight: "#E53935" },
    stroke: "#7F0000",
};
