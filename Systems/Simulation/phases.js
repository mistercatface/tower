import { runPushablePhysics } from "./pushablePhysics.js";
/** @typedef {import("./SimulationRuntime.js").SimulationRuntime} SimulationRuntime */
/** @typedef {{ run: (ctx: object, dt: number, runtime: SimulationRuntime) => void }} SimulationPhase */
/** @type {SimulationPhase} */
export const pushablePhysicsPhase = {
    id: "pushablePhysics",
    run(ctx, dt, runtime) {
        runPushablePhysics(ctx.state, dt, runtime.spatialFrame, runtime.events);
    },
};
