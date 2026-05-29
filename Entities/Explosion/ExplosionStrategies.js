import { Utilities } from "../../Core/Utilities.js";
import { PhysicsSystem } from "../../Spatial/Motion/PhysicsSystem.js";

function repelEntities(state, exp, dt) {
    for (const e of state.enemies) {
        if (e.isDead) continue;
        const dx = e.x - exp.x;
        const dy = e.y - exp.y;
        const dist = Math.hypot(dx, dy);
        const minDist = exp.radius + e.radius;
        if (dist < minDist) {
            if (Utilities.hasLineOfSight(exp.x, exp.y, e.x, e.y, state.walls, e.radius)) {
                let pushX = 1, pushY = 0;
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
                e.x += pushX * overlap;
                e.y += pushY * overlap;

                const angle = Math.atan2(pushY, pushX);
                e.changeState("blasted", { angle: angle, timer: 500 });
                PhysicsSystem.resolveWallCollisions(e, state.walls, state);
            }
        }
    }

    const p = state.player;
    if (p && !p.isDead) {
        const dx = p.x - exp.x;
        const dy = p.y - exp.y;
        const dist = Math.hypot(dx, dy);
        const minDist = exp.radius + p.radius;
        if (dist < minDist) {
            if (Utilities.hasLineOfSight(exp.x, exp.y, p.x, p.y, state.walls, p.radius)) {
                let pushX = 1, pushY = 0;
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
                p.x += pushX * overlap;
                p.y += pushY * overlap;

                const angle = Math.atan2(pushY, pushX);
                p.changeState("blasted", { angle: angle, timer: 500 });
                PhysicsSystem.resolveWallCollisions(p, state.walls, state);
            }
        }
    }
}

export const ExplosionStrategies = {
    standard: {
        update(state, exp, dt, allEvents) {
            if (exp.currentPhase?.update) {
                exp.currentPhase.update(state, exp, dt, allEvents);
            }
        },
        repel(state, exp, dt) {
            if (exp.currentPhase?.repelsEntities) {
                repelEntities(state, exp, dt);
            }
        },
    },
};
