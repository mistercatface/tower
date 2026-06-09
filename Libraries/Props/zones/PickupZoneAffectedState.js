import { getZoneHandler } from "./zoneHandlers.js";

export class PickupZoneAffectedState {
    blocksSleep() {
        return true;
    }
    onExit(pickup) {
        pickup.elevation = 0;
        pickup.elevationVelocity = 0;
        pickup.opacity = 1;
    }
    update(pickup, dt, _walls, state) {
        const effect = pickup.stateData;
        const handler = getZoneHandler(effect.zoneKind);
        if (!handler?.tick) return;
        const emitter = state.pickups?.find((p) => p.id === effect.emitterId) ?? null;
        handler.tick(pickup, emitter, effect, dt, state);
    }
}
