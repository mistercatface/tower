/**
 * Stack context motif — shifts eval (and optionally warped lookup) for downstream layers.
 * Pixel output is handled in FloorTextureComposer; apply() is intentionally empty.
 */
export const translateMotif = {
    apply() {},
};

/** @typedef {"evalAndWarped" | "evalOnly"} TranslateCoordinateMode */

export const TRANSLATE_COORDINATE_MODES = {
    evalAndWarped: "evalAndWarped",
    evalOnly: "evalOnly",
};

export function readTranslateConfig(config) {
    return {
        x: config.x ?? config.position?.[0] ?? 0,
        y: config.y ?? config.position?.[1] ?? 0,
        mode: config.coordinateMode ?? TRANSLATE_COORDINATE_MODES.evalAndWarped,
    };
}
