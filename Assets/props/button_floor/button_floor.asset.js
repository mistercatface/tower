import { DEFAULT_BUTTON_FLOOR_RADIUS } from "../../../Libraries/Sandbox/buttonFloorDefaults.js";
import { DEFAULT_BUTTON_INPUT_MODE, DEFAULT_BUTTON_MASS_THRESHOLD } from "../../../Libraries/Sandbox/buttonInput.js";
import { createButtonFloorDraw } from "../../../Libraries/Render/buttonFloorDraw.js";
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
