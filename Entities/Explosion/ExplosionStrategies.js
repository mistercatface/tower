import { PhysicsSystem } from "../../Spatial/Motion/PhysicsSystem.js";

function repelActor(actor, exp, state, spatialFrame) {
    if (actor.isDead) return;
    const dx = actor.x - exp.x;
    const dy = actor.y - exp.y;
    const dist = Math.hypot(dx, dy);
    const minDist = exp.radius + actor.radius;
    if (dist >= minDist) return;
    if (!actor.hasLineOfSightFromPoint(exp.x, exp.y, state, { sourceRadius: 0 })) return;
    let pushX = 1;
    let pushY = 0;
    let pushDist = dist;
    if (pushDist === 0) {
        const angle = Math.random() * Math.PI * 2;
        pushX = Math.cos(angle);
        pushY = Math.sin(angle);
        pushDist = 0.1;
    } else {
        pushX = dx / pushDist;
        pushY = dy / pushDist;
    }
    const overlap = minDist - pushDist;
    actor.x += pushX * overlap;
    actor.y += pushY * overlap;
    const angle = Math.atan2(pushY, pushX);
    actor.changeState("blasted", { angle, timer: 500 });
    PhysicsSystem.resolveWallCollisions(actor, spatialFrame, state);
}

function repelEntities(state, exp, _dt, spatialFrame) {
    for (const actor of state.getCombatants()) {
        repelActor(actor, exp, state, spatialFrame);
    }
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
