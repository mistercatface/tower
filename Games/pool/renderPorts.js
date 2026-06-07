import { createDefaultRenderPorts } from "../../Libraries/Render/defaultRenderPorts.js";
import { createCachedWorldStructure } from "../../Libraries/Render/worldStructure/CachedWorldStructure.js";
import { drawPoolPockets } from "./drawPockets.js";
/** @type {import("../../Core/GameDefinitionTypes.js").RenderPorts} */
export const poolRenderPorts = {
    ...createDefaultRenderPorts(),
    worldStructure: createCachedWorldStructure(),
    simulationEffectPasses: [{ zIndex: 10, draw: drawPoolPockets }],
};

