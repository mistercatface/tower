import { CollisionSystem } from "../../Systems/Collision/CollisionSystem.js";
import { minDistanceSegmentToWall } from "../../Libraries/Spatial/geometry/WallGeometry.js";
import { getTargeting } from "../../Core/GamePorts.js";

function getBroadphaseActors(state) {
    return getTargeting().getBroadphaseActors(state);
}
import { LIBRARY_EXPLOSION_DEFAULTS as explosionSettings } from "../../Libraries/Combat/explosionDefaults.js";
function blastDamage(exp, dist, maxMultiplier, minMultiplier) {
    const maxDmg = exp.damage * maxMultiplier;
    const minDmg = exp.damage * minMultiplier;
    const proximityRatio = Math.min(1.0, dist / exp.maxRadius);
    return Math.round(maxDmg - (maxDmg - minDmg) * proximityRatio);
}
function blastMultipliersFor(actor) {
    if (typeof actor.getExplosionBlastMultipliers === "function") return actor.getExplosionBlastMultipliers();
    return actor.faction === "player" ? explosionSettings.playerMultipliers : explosionSettings.enemyMultipliers;
}
function applyExpandingDamage(state, exp, allEvents) {
    for (const seg of state.walls) {
        if (seg.isDead || exp.hitTargets.has(seg)) continue;
        if (CollisionSystem.checkCircleRect(exp, seg)) {
            let blocked = false;
            for (const otherSeg of state.walls) {
                if (otherSeg === seg || otherSeg.isDead) continue;
                if (minDistanceSegmentToWall(exp.x, exp.y, seg.x, seg.y, otherSeg) === 0) {
                    blocked = true;
                    break;
                }
            }
            if (!blocked) {
                allEvents.push({ target: seg, damage: explosionSettings.wallBlastDamage, type: "blast" });
                exp.hitTargets.add(seg);
            }
        }
    }
    for (const actor of getBroadphaseActors(state)) {
        if (exp.hitTargets.has(actor)) continue;
        const dist = Math.hypot(actor.x - exp.x, actor.y - exp.y);
        if (dist <= exp.radius + actor.radius)
            if (actor.hasLineOfSightFromPoint(exp.x, exp.y, state, { sourceRadius: 0 })) {
                const [maxMultiplier, minMultiplier] = blastMultipliersFor(actor);
                allEvents.push({ target: actor, damage: blastDamage(exp, dist, maxMultiplier, minMultiplier), type: "blast", explosion: exp });
                exp.hitTargets.add(actor);
            }
    }
    for (const p of state.pickups) {
        if (p.isDead || exp.hitTargets.has(p)) continue;
        const dist = Math.hypot(p.x - exp.x, p.y - exp.y);
        if (dist <= exp.radius + p.radius)
            if (p.hasLineOfSightFromPoint(exp.x, exp.y, state, { sourceRadius: 0 }))
                if (p.strategy?.onHit) {
                    p.strategy.onHit(state, p, { isDead: false, isExplosion: true, x: exp.x, y: exp.y }, allEvents);
                    exp.hitTargets.add(p);
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
        if (exp.lingerTimer <= 0) exp.changePhase("fading");
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
        if (exp.fadeTimer <= 0) exp.isDead = true;
    }
}
export const standardExplosionPhases = { expanding: new ExplosionExpandingPhase(), lingering: new ExplosionLingeringPhase(), fading: new ExplosionFadingPhase() };
