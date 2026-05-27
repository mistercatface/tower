export class FloatingText {
    constructor(x, y, text, color, timerId) {
        this.x = x;
        this.y = y;
        this.text = text;
        this.color = color;
        this.timerId = timerId;
        this.life = 1.0;
        this.isDead = false;
        this.vx = 0;
        this.vy = -20;
        this.gravity = 0;
        this.maxLife = 1000;
        this.isBlast = false;
        this.font = "12px monospace";
        this.shadowColor = "rgba(0, 0, 0, 0.8)";
    }

    update(dt, scheduler) {
        const dtSec = dt / 1000;
        this.x += this.vx * dtSec;
        this.y += this.vy * dtSec;
        if (this.gravity) {
            this.vy += this.gravity * dtSec;
        }
        const remaining = scheduler.getTimeRemaining(this.timerId);
        this.life = remaining / this.maxLife;
        if (remaining <= 0) this.isDead = true;
    }

    static spawn(state, x, y, text, color, options = {}) {
        const offsetX = (Math.random() - 0.5) * 16;
        const offsetY = (Math.random() - 0.5) * 16;
        const duration = options.duration || 1000;
        const timerId = state.scheduler.schedule(duration);
        const ft = new FloatingText(x + offsetX, y + offsetY, text, color, timerId);
        ft.maxLife = duration;
        ft.vx = options.vx !== undefined ? options.vx : 0;
        ft.vy = options.vy !== undefined ? options.vy : -20;
        ft.gravity = options.gravity !== undefined ? options.gravity : 0;
        ft.isBlast = options.isBlast || false;
        ft.font = options.font || "12px monospace";
        ft.shadowColor = options.shadowColor || "rgba(0, 0, 0, 0.8)";
        state.floatingTexts.push(ft);
    }

    static updateAll(state, dt) {
        for (let i = state.floatingTexts.length - 1; i >= 0; i--) {
            const ft = state.floatingTexts[i];
            ft.update(dt, state.scheduler);
            if (ft.isDead) state.floatingTexts.splice(i, 1);
        }
    }

    render(ctx) {
        ctx.save();
        ctx.globalAlpha = Math.max(0, this.life);
        
        const ageRatio = 1.0 - this.life;
        let scale = 1.0;
        if (this.isBlast) {
            if (ageRatio < 0.25) {
                const t = ageRatio / 0.25;
                scale = 2.2 - (2.2 - 1.3) * t;
            } else {
                scale = 1.3;
            }
        } else {
            if (ageRatio < 0.15) {
                const t = ageRatio / 0.15;
                scale = 1.5 - 0.5 * t;
            }
        }
        
        ctx.translate(this.x, this.y);
        ctx.scale(scale, scale);
        
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.font = this.font || "bold 12px monospace";
        
        ctx.strokeStyle = "rgba(0, 0, 0, 0.95)";
        ctx.lineWidth = this.isBlast ? 3.5 : 2.5;
        ctx.lineJoin = "round";
        ctx.miterLimit = 2;
        ctx.strokeText(this.text, 0, 0);
        
        if (this.isBlast) {
            const gradient = ctx.createLinearGradient(0, -6, 0, 6);
            gradient.addColorStop(0, "#FFF9C4");
            gradient.addColorStop(0.3, "#FFEB3B");
            gradient.addColorStop(0.65, "#FF5722");
            gradient.addColorStop(1, "#F44336");
            ctx.fillStyle = gradient;
        } else {
            ctx.fillStyle = this.color;
        }
        
        ctx.fillText(this.text, 0, 0);
        ctx.restore();
    }
}