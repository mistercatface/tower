import { CollisionSystem } from "../../Spatial/Collision/CollisionSystem.js";
import { Utilities } from "../../Core/Utilities.js";

function blastDamage(exp, dist, maxMultiplier, minMultiplier) {
    const maxDmg = exp.damage * maxMultiplier;
    const minDmg = exp.damage * minMultiplier;
    const proximityRatio = Math.min(1.0, dist / exp.maxRadius);
    return maxDmg - (maxDmg - minDmg) * proximityRatio;
}

function applyExpandingDamage(state, exp, allEvents) {
    for (const seg of state.walls) {
        if (seg.isDead || exp.hitTargets.has(seg)) continue;
        if (CollisionSystem.checkCircleRect(exp, seg)) {
            let blocked = false;
            for (const otherSeg of state.walls) {
                if (otherSeg === seg || otherSeg.isDead) continue;
                const dist = Utilities.distToSegment(otherSeg.x, otherSeg.y, exp.x, exp.y, seg.x, seg.y);
                if (dist < otherSeg.size * 0.5) {
                    blocked = true;
                    break;
                }
            }
            if (!blocked) {
                allEvents.push({ target: seg, damage: 10, type: "blast" });
                exp.hitTargets.add(seg);
            }
        }
    }

    for (const e of state.enemies) {
        if (e.isDead || exp.hitTargets.has(e)) continue;
        const dist = Math.hypot(e.x - exp.x, e.y - exp.y);
        if (dist <= exp.radius + e.radius) {
            if (Utilities.hasLineOfSight(exp.x, exp.y, e.x, e.y, state.walls, e.radius)) {
                allEvents.push({ target: e, damage: blastDamage(exp, dist, 1.6, 0.4), type: "blast" });
                exp.hitTargets.add(e);
            }
        }
    }

    if (!exp.hitTargets.has(state.player)) {
        const dist = Math.hypot(state.player.x - exp.x, state.player.y - exp.y);
        if (dist <= exp.radius + state.player.radius) {
            if (Utilities.hasLineOfSight(exp.x, exp.y, state.player.x, state.player.y, state.walls, state.player.radius)) {
                allEvents.push({ target: state.player, damage: blastDamage(exp, dist, 1, 0.5), type: "blast" });
                exp.hitTargets.add(state.player);
            }
        }
    }

    for (const p of state.pickups) {
        if (p.isDead || exp.hitTargets.has(p)) continue;
        const dist = Math.hypot(p.x - exp.x, p.y - exp.y);
        if (dist <= exp.radius + p.radius) {
            if (Utilities.hasLineOfSight(exp.x, exp.y, p.x, p.y, state.walls, p.radius)) {
                if (p.strategy?.onHit) {
                    const dmg = blastDamage(exp, dist, 1.6, 0.4);
                    p.strategy.onHit(state, p, { isDead: false, damage: dmg, isExplosion: true }, allEvents);
                    exp.hitTargets.add(p);
                }
            }
        }
    }
}

export class ExplosionExpandingPhase {
    constructor() {
        this.repelsEntities = true;
        this.brightFill = true;
        this.screenBlend = true;
    }

    update(state, exp, dt, allEvents) {
        exp.radius += exp.speed * (dt / 1000);
        applyExpandingDamage(state, exp, allEvents);

        if (exp.radius >= exp.maxRadius) {
            exp.radius = exp.maxRadius;
            exp.changePhase("lingering");
        }
    }
}

export class ExplosionLingeringPhase {
    constructor() {
        this.repelsEntities = true;
        this.brightFill = false;
        this.screenBlend = false;
    }

    update(state, exp, dt) {
        exp.lingerTimer -= dt;
        if (exp.lingerTimer <= 0) {
            exp.changePhase("fading");
        }
    }
}

export class ExplosionFadingPhase {
    constructor() {
        this.repelsEntities = false;
        this.brightFill = false;
        this.screenBlend = false;
    }

    update(state, exp, dt) {
        exp.fadeTimer -= dt;
        exp.opacity = Math.max(0, exp.fadeTimer / 500);
        if (exp.fadeTimer <= 0) {
            exp.isDead = true;
        }
    }
}

export const standardExplosionPhases = {
    expanding: new ExplosionExpandingPhase(),
    lingering: new ExplosionLingeringPhase(),
    fading: new ExplosionFadingPhase(),
};
