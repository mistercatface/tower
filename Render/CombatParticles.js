/** Pixel blood/spark bursts on combat hits (ported from cw803 impact particles). */

const MAX_PARTICLES = 450;

const BLOOD_PALETTE = ["#b81414", "#7a0909", "#ad0000", "#8a0000"];

function pickBloodColor() {
    return BLOOD_PALETTE[Math.floor(Math.random() * BLOOD_PALETTE.length)];
}

class PixelParticle {
    constructor(x, y, vx, vy, color, sizeWorld, lifeSec, decay) {
        this.x = x;
        this.y = y;
        this.vx = vx;
        this.vy = vy;
        this.color = color;
        this.sizeWorld = sizeWorld;
        this.life = lifeSec;
        this.maxLife = lifeSec;
        this.decay = decay;
        this.isDead = false;
    }

    update(dtMs) {
        const dtSec = dtMs / 1000;
        this.x += this.vx * dtSec;
        this.y += this.vy * dtSec;
        this.vx *= 0.9;
        this.vy *= 0.9;
        this.life -= dtSec * this.decay;
        if (this.life <= 0) {
            this.isDead = true;
        }
    }

    isVisible(viewport) {
        if (!viewport?.isVisible) return true;
        return viewport.isVisible(this.x, this.y, 12);
    }

    render(ctx, _renderer, _state) {
        const alpha = Math.max(0, Math.min(1, this.life / this.maxLife));
        if (alpha <= 0) return;

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = this.color;
        const size = Math.max(3, this.sizeWorld);
        ctx.fillRect(Math.floor(this.x - size * 0.5), Math.floor(this.y - size * 0.5), size, size);
        ctx.restore();
    }
}

export class CombatParticles {
    static ensure(state) {
        if (!state.combatParticles) {
            state.combatParticles = [];
        }
    }

    /**
     * @param {object} state
     * @param {number} x
     * @param {number} y
     * @param {{ impactAngle?: number, count?: number, intensity?: number }} [options]
     */
    static spawnBlood(state, x, y, options = {}) {
        CombatParticles.ensure(state);
        const count = options.count ?? 4;
        const intensity = options.intensity ?? 1;
        const impactAngle = options.impactAngle;
        const sizeBase = options.sizeBase ?? 4;

        for (let i = 0; i < count; i++) {
            let angle;
            if (impactAngle != null) {
                angle = impactAngle + Math.PI + (Math.random() - 0.5) * 1.4;
            } else {
                angle = Math.random() * Math.PI * 2;
            }
            const spread = (Math.random() - 0.5) * 0.6;
            const speed = (80 + Math.random() * 140) * intensity;
            const vx = Math.cos(angle + spread) * speed;
            const vy = Math.sin(angle + spread) * speed;
            const life = 0.45 + Math.random() * 0.35;
            const sizeWorld = sizeBase * (0.75 + Math.random() * 0.5);
            state.combatParticles.push(
                new PixelParticle(
                    x + (Math.random() - 0.5) * sizeBase,
                    y + (Math.random() - 0.5) * sizeBase,
                    vx,
                    vy,
                    pickBloodColor(),
                    sizeWorld,
                    life,
                    2.0,
                ),
            );
        }

        while (state.combatParticles.length > MAX_PARTICLES) {
            state.combatParticles.shift();
        }
    }

    static resolveImpactAngle(actor, event) {
        if (event?.projectile) {
            return event.projectile.angle;
        }
        if (event?.type === "blast" && event.explosion) {
            return Math.atan2(actor.y - event.explosion.y, actor.x - event.explosion.x);
        }
        return null;
    }

    static spawnBloodForActorHit(state, actor, damage, hitType, died, event) {
        if (!state || damage <= 0 || !actor.usesKinematicsBody || died) return;

        const impactAngle = CombatParticles.resolveImpactAngle(actor, event);
        const spread = (Math.random() - 0.5) * actor.radius * 0.6;
        const bx = actor.x + Math.cos(impactAngle ?? 0) * spread;
        const by = actor.y + Math.sin(impactAngle ?? 0) * spread;

        const sizeBase = Math.max(4, actor.radius * 0.45);
        let count = 6;
        let intensity = 1;
        if (died) {
            count = 22;
            intensity = 1.5;
        } else if (hitType === "blast") {
            count = 10;
            intensity = 1.2;
        }

        CombatParticles.spawnBlood(state, bx, by, { impactAngle, count, intensity, sizeBase });
    }

    /** Death spray for kinematics actors (replaces legacy circle wedges until ragdoll corpses). */
    static spawnDeathBlood(state, actor, event) {
        if (!state || !actor) return;
        const impactAngle = CombatParticles.resolveImpactAngle(actor, event);
        CombatParticles.spawnBlood(state, actor.x, actor.y, {
            impactAngle,
            count: 28,
            intensity: 1.65,
            sizeBase: Math.max(5, actor.radius * 0.55),
        });
    }

    static updateAll(state, dt) {
        if (!state.combatParticles?.length) return;
        for (let i = state.combatParticles.length - 1; i >= 0; i--) {
            const p = state.combatParticles[i];
            p.update(dt);
            if (p.isDead) {
                state.combatParticles.splice(i, 1);
            }
        }
    }

    static renderCollection(ctx, collection, viewport) {
        if (!collection?.length) return;
        for (const p of collection) {
            if (viewport && !p.isVisible(viewport)) continue;
            p.render(ctx);
        }
    }
}
