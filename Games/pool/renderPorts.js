import { createDefaultRenderPorts } from "../../Libraries/Render/defaultRenderPorts.js";
import { drawPoolPockets } from "./drawPockets.js";
/** @type {import("../../Core/GameDefinitionTypes.js").RenderPorts} */
export const poolRenderPorts = { ...createDefaultRenderPorts(), simulationEffectPasses: [{ zIndex: 10, draw: drawPoolPockets }] };
