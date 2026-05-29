/**
 * Shared enter/exit transition for entity-level state machines (actors, pickups, etc.).
 */
export function transitionEntity(host, states, name, stateDataInit = null) {
    if (host.currentState?.onExit) {
        host.currentState.onExit(host);
    }
    host.currentState = states[name];
    host.currentStateName = name;
    host.stateData = stateDataInit ?? {};
    if (host.currentState?.onEnter) {
        host.currentState.onEnter(host);
    }
}
