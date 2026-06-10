import { runPushablePhysics } from "../../Libraries/Motion/pushablePhysicsPass.js";
/** @typedef {{ run: (state: object, dt: number, spatialFrame: object, events: object[]) => void }} SimulationPhase */
/** @type {SimulationPhase} */
export const pushablePhysicsPhase = { id: "pushablePhysics", run: runPushablePhysics };
