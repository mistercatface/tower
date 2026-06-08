import { repelActorFromExplosion } from "../../Libraries/Combat/explosionKnockback.js";
function repelEntities(state, exp, _dt, spatialFrame) {
    const actors = state.getCombatants ? state.getCombatants() : state.getPlayerActors ? state.getPlayerActors() : [];
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
