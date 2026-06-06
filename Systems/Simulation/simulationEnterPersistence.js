import { wakeAllPushables } from "../../Libraries/Motion/pushablePhysicsPass.js";
import { syncSurfaceProfile } from "../../Render/game/surfaceProfileResolver.js";

function syncPersistentEntitiesOnSimulationEnter(state) {
    syncSurfaceProfile(state);
    wakeAllPushables(state);
    const persistentEntities = [...state.getAllies(), ...state.pickups];
    for (const entity of persistentEntities) if (typeof entity.onCombatReenter === "function") entity.onCombatReenter(state);
}

export function runSimulationEnterPersistence(state) {
    syncPersistentEntitiesOnSimulationEnter(state);
}
