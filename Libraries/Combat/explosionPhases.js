import { LIBRARY_EXPLOSION_DEFAULTS as explosionSettings } from "./explosionDefaults.js";
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
function applyBlastToTarget(state, exp, allEvents, target) {
    if (exp.hitTargets.has(target) || target.isDead) return;
    const dist = Math.hypot(target.x - exp.x, target.y - exp.y);
    if (dist > exp.radius + target.radius) return;
    if (!target.hasLineOfSightFromPoint(exp.x, exp.y, state, { sourceRadius: 0 })) return;
    const [maxMultiplier, minMultiplier] = blastMultipliersFor(target);
    allEvents.push({ target, damage: blastDamage(exp, dist, maxMultiplier, minMultiplier), type: "blast", explosion: exp });
    exp.hitTargets.add(target);
    if (target.strategy?.onHit) target.strategy.onHit(state, target, { isDead: false, isExplosion: true, x: exp.x, y: exp.y }, allEvents);
}
function applyExpandingDamage(state, exp, allEvents) {
    state.entityRegistry.forEachOfKind("worldProp", (p) => applyBlastToTarget(state, exp, allEvents, p));
}
export class ExplosionExpandingPhase {
    constructor() {
        this.repelsEntities = true;
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
    }
    update(state, exp, dt) {
        exp.lingerTimer -= dt;
        if (exp.lingerTimer <= 0) exp.changePhase("fading");
    }
}
export class ExplosionFadingPhase {
    constructor() {
        this.repelsEntities = false;
    }
    update(state, exp, dt) {
        exp.fadeTimer -= dt;
        exp.opacity = Math.max(0, exp.fadeTimer / 500);
        if (exp.fadeTimer <= 0) exp.isDead = true;
    }
}
export const standardExplosionPhases = { expanding: new ExplosionExpandingPhase(), lingering: new ExplosionLingeringPhase(), fading: new ExplosionFadingPhase() };
