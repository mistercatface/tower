/** Crisp screen-pixel blood bursts on hits (separate from ragdoll drip blood). */

const MAX_PARTICLES = 200;

const BLOOD_PALETTE = ["#b81414", "#7a0909", "#ad0000"];

function pickBloodColor() {
    return BLOOD_PALETTE[Math.floor(Math.random() * BLOOD_PALETTE.length)];
}

class PixelParticle {
    constructor(x, y, vx, vy, color, sizePx, lifeSec, decay) {
        this.x = x;
        this.y = y;
        this.vx = vx;
        this.vy = vy;
        this.color = color;
        this.sizePx = sizePx;
        this.life = lifeSec;
        this.maxLife = lifeSec;
        this.decay = decay;
        this.isDead = false;
    }

    update(dtMs) {
        const dtSec = dtMs / 1000;
        this.x += this.vx * dtSec;
        this.y += this.vy * dtSec;
        this.vx *= 0.88;
        this.vy *= 0.88;
        this.life -= dtSec * this.decay;
        if (this.life <= 0) {
            this.isDead = true;
        }
    }

    isVisible(viewport) {
        if (!viewport?.isVisible) return true;
        return viewport.isVisible(this.x, this.y, 14);
    }

    /** Draw in screen space (call after viewport transform is restored). */
    renderScreen(ctx, viewport) {
        const t = this.life / this.maxLife;
        if (t <= 0.12) return;

        const screen = viewport.worldToScreen(this.x, this.y);
        const px = Math.round(screen.x);
        const py = Math.round(screen.y);
        const size = this.sizePx >= 3 ? this.sizePx : (t > 0.45 ? this.sizePx : 1);

        ctx.fillStyle = this.color;
        if (size <= 1) {
            ctx.fillRect(px, py, 1, 1);
        } else {
            const half = Math.floor(size / 2);
            ctx.fillRect(px - half, py - half, size, size);
        }
    }
}

export class CombatParticles {
    static ensure(state) {
        if (!state.combatParticles) {
            state.combatParticles = [];
        }
    }

    static spawnBlood(state, x, y, options = {}) {
        CombatParticles.ensure(state);
        const count = options.count ?? 3;
        const intensity = options.intensity ?? 1;
        const impactAngle = options.impactAngle;
        const sizePx = options.sizePx ?? 2;

        for (let i = 0; i < count; i++) {
            let angle;
            if (impactAngle != null) {
                angle = impactAngle + Math.PI + (Math.random() - 0.5) * 1.0;
            } else {
                angle = Math.random() * Math.PI * 2;
            }
            const speed = (120 + Math.random() * 100) * intensity;
            const vx = Math.cos(angle) * speed;
            const vy = Math.sin(angle) * speed;
            const life = 0.18 + Math.random() * 0.14;

            state.combatParticles.push(
                new PixelParticle(
                    x + (Math.random() - 0.5) * 3,
                    y + (Math.random() - 0.5) * 3,
                    vx,
                    vy,
                    pickBloodColor(),
                    Math.random() > 0.35 ? sizePx : 1,
                    life,
                    4.5,
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
        const spread = (Math.random() - 0.5) * actor.radius * 0.35;
        const bx = actor.x + Math.cos(impactAngle ?? 0) * spread;
        const by = actor.y + Math.sin(impactAngle ?? 0) * spread;

        let count = 3;
        let sizePx = 2;
        if (hitType === "blast") {
            count = 5;
            sizePx = 2;
        }

        CombatParticles.spawnBlood(state, bx, by, { impactAngle, count, intensity: 1, sizePx });
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

    /** Screen-space pass — crisp pixels, no subpixel alpha blur. */
    static renderAll(ctx, state, viewport) {
        if (!state.combatParticles?.length || !viewport) return;

        ctx.save();
        ctx.imageSmoothingEnabled = false;

        for (const p of state.combatParticles) {
            if (!p.isVisible(viewport)) continue;
            p.renderScreen(ctx, viewport);
        }

        ctx.restore();
    }
}
