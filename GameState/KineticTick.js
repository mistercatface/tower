import { worldSimFromState } from "./WorldSim.js";
export function createKineticTick(frame, world) {
    return { frame, world };
}
export function kineticTickFromState(state, frame) {
    return createKineticTick(frame, worldSimFromState(state));
}
