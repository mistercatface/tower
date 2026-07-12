import { TRANSLATE_MODE_EVAL_AND_WARPED, TRANSLATE_MODE_EVAL_ONLY } from "../../../Core/engineEnums.js";
export const translateMotif = {
    metadata: {
        label: "Translate",
        isContext: true,
        defaults: { type: "translate", x: 0, y: 0, coordinateMode: TRANSLATE_MODE_EVAL_AND_WARPED },
        fields: [
            { path: "x", label: "X", min: -2000, max: 2000, step: 5 },
            { path: "y", label: "Y", min: -2000, max: 2000, step: 5 },
            {
                path: "coordinateMode",
                label: "Coordinate space",
                options: [
                    { id: TRANSLATE_MODE_EVAL_AND_WARPED, label: "Eval + warped" },
                    { id: TRANSLATE_MODE_EVAL_ONLY, label: "Eval only" },
                ],
            },
        ],
    },
    apply() {},
};
export function readTranslateInto(f32, fO, i32, iO, config) {
    f32[fO] = config.x ?? config.position?.[0] ?? 0;
    f32[fO + 1] = config.y ?? config.position?.[1] ?? 0;
    i32[iO] = config.coordinateMode ?? TRANSLATE_MODE_EVAL_AND_WARPED;
}
