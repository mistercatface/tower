import { generateWorld } from "../../Core/GamePorts.js";
/** @typedef {import("./RunBootstrapPipeline.js").RunBootstrapContext} RunBootstrapContext */
/** @typedef {import("./RunBootstrapPipeline.js").RunBootstrapPhase} RunBootstrapPhase */
/** @type {RunBootstrapPhase} */
export const generateWorldPhase = {
    run(ctx) {
        generateWorld(ctx.state);
    },
};
