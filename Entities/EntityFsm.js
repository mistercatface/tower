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

/** Phase lifecycle for explosions (uses currentPhase / currentPhaseName on the host). */
export function transitionPhase(host, phases, name, phaseDataInit = null) {
    if (host.currentPhase?.onExit) {
        host.currentPhase.onExit(host);
    }
    host.currentPhase = phases[name];
    host.currentPhaseName = name;
    host.phaseData = phaseDataInit ?? {};
    if (host.currentPhase?.onEnter) {
        host.currentPhase.onEnter(host);
    }
}
