import { runPushablePhysics } from "./pushablePhysics.js";
/** @typedef {{ run: (state: object, dt: number, spatialFrame: object, events: object[]) => void }} SimulationPhase */
/** @type {SimulationPhase} */
export const pushablePhysicsPhase = {
    id: "pushablePhysics",
    run(state, dt, spatialFrame, events) {
        runPushablePhysics(state, dt, spatialFrame, events);
    },
};
