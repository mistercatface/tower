export const DEFAULT_BUTTON_FLOOR_RADIUS = 8;
export const DEFAULT_BUTTON_INPUT_MODE = "tap";
export const DEFAULT_BUTTON_MASS_THRESHOLD = 0;
import { createButtonFloorDraw } from "../../../Libraries/Render/render.js";
export default {
    id: "button_floor",
    draw: createButtonFloorDraw(),
    sandbox: { spawnLabel: "Button" },
    physics: {
        renderMode: "floor",
        spatialRole: "trigger",
        isKinetic: false,
        radius: DEFAULT_BUTTON_FLOOR_RADIUS,
        buttonLinks: [],
        inputMode: DEFAULT_BUTTON_INPUT_MODE,
        massThreshold: DEFAULT_BUTTON_MASS_THRESHOLD,
        invert: false,
    },
};
