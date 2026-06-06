export const translateMotif = {
    metadata: {
        label: "Translate",
        isContext: true,
        defaults: { type: "translate", x: 0, y: 0, coordinateMode: "evalAndWarped" },
        fields: [
            { path: "x", label: "X", min: -2000, max: 2000, step: 5 },
            { path: "y", label: "Y", min: -2000, max: 2000, step: 5 },
            {
                path: "coordinateMode",
                label: "Coordinate space",
                options: [
                    { value: "evalAndWarped", label: "Eval + warped" },
                    { value: "evalOnly", label: "Eval only" },
                ],
            },
        ],
    },
    apply() {},
};
/** @typedef {"evalAndWarped" | "evalOnly"} TranslateCoordinateMode */
export const TRANSLATE_COORDINATE_MODES = { evalAndWarped: "evalAndWarped", evalOnly: "evalOnly" };
export function readTranslateConfig(config) {
    return { x: config.x ?? config.position?.[0] ?? 0, y: config.y ?? config.position?.[1] ?? 0, mode: config.coordinateMode ?? TRANSLATE_COORDINATE_MODES.evalAndWarped };
}
