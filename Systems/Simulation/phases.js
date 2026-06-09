import { getRunScenePort } from "../../Core/GamePorts.js";
import { runPushablePhysics } from "./pushablePhysics.js";
import { processGroundZones } from "../../Libraries/Spatial/zones/processGroundZones.js";
/** @typedef {import("./SimulationRuntime.js").SimulationRuntime} SimulationRuntime */
/** @typedef {{ run: (ctx: object, dt: number, runtime: SimulationRuntime) => void }} SimulationPhase */
/** @type {SimulationPhase} */
export const gameSceneTickPhase = {
    run(ctx, dt) {
        getRunScenePort().onTick(ctx, dt);
    },
};
/** @type {SimulationPhase} */
export const pushablePhysicsPhase = {
    id: "pushablePhysics",
    run(ctx, dt, runtime) {
        runPushablePhysics(ctx.state, dt, runtime.spatialFrame, runtime.events);
    },
};
/** @type {SimulationPhase} */
export const groundZonePhase = {
    id: "groundZone",
    run(ctx, _dt, runtime) {
        processGroundZones(runtime.spatialFrame, ctx.state.groundZones);
    },
};
/** @type {SimulationPhase} */
export const worldSurfacePhase = {
    run(ctx) {
        ctx.state.worldSurfaces.updateFills();
    },
};
