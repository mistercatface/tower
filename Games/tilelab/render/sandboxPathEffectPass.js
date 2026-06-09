import { getTilelabSandboxController } from "../world/tilelabSandbox.js";
/** @type {import("../../../Core/GameDefinitionTypes.js").SimulationEffectPass} */
export const sandboxPathEffectPass = {
    zIndex: 65,
    draw(_state, _viewport, ctx) {
        getTilelabSandboxController()?.drawPathOverlay(ctx);
    },
};
