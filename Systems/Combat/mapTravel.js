import { wakeAllPushables } from "../../Libraries/Motion/pushablePhysicsPass.js";
import { syncSurfaceProfile } from "../../Render/game/surfaceProfileResolver.js";

function runPersistentSectorEnter(state) {
    syncSurfaceProfile(state);
    wakeAllPushables(state);
    const persistentEntities = [...state.getAllies(), ...state.pickups];
    for (const entity of persistentEntities) {
        if (typeof entity.onSectorEnter === "function") entity.onSectorEnter(state);
    }
}

export function runPersistentSectorEnterOnNode(state) {
    runPersistentSectorEnter(state);
}
