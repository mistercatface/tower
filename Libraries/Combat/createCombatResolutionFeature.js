import { dispatchEventsPhase, ragdollCorpsePhase } from "./simulationPhases.js";
export function createCombatResolutionFeature() {
    return { simulationPhaseInsertAfter: "pushablePhysics", simulationPhases: [ragdollCorpsePhase, dispatchEventsPhase] };
}
