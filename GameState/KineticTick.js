import { worldSimFromState } from "./WorldSim.js";
export function createKineticTick(frame, world) {
    return { frame, session: world.kinetic, world };
}
export function kineticTickFromState(state, frame) {
    return createKineticTick(frame, worldSimFromState(state));
}

export function createContactPassTick(frame, session) {
    return { frame, session, world: { worldProps: [], entityRegistry: { getLive: () => null }, kinetic: session } };
}
