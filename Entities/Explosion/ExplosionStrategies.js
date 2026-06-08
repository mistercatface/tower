import { repelActorFromExplosion } from "../../Libraries/Combat/explosionKnockback.js";
import { getTargeting } from "../../Core/GamePorts.js";

function repelEntities(state, exp, _dt, spatialFrame) {
    const actors = getTargeting().getBroadphaseActors(state);
    for (const actor of actors) repelActorFromExplosion(actor, exp, spatialFrame, state);
}
export const ExplosionStrategies = {
    standard: {
        update(state, exp, dt, allEvents) {
            if (exp.currentPhase?.update) exp.currentPhase.update(state, exp, dt, allEvents);
        },
        repel(state, exp, dt, spatialFrame) {
            if (exp.currentPhase?.repelsEntities) repelEntities(state, exp, dt, spatialFrame);
        },
    },
};
