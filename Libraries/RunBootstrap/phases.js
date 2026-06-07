import { generateWorld } from "../../Core/GamePorts.js";
import { createRunBootstrapPort } from "./RunBootstrapPipeline.js";
/** @typedef {import("./RunBootstrapPipeline.js").RunBootstrapContext} RunBootstrapContext */
/** @typedef {import("./RunBootstrapPipeline.js").RunBootstrapPhase} RunBootstrapPhase */
/** @type {RunBootstrapPhase} */
export const generateWorldPhase = {
    run(ctx) {
        generateWorld(ctx.state);
    },
};
/** New-run bootstrap with map layout only — no player, props, or party. */
export const layoutOnlyRunBootstrap = createRunBootstrapPort([generateWorldPhase]);
