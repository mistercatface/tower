import { Entity } from "./Entity.js";
import { PhysicsSystem } from "../Spatial/Motion/PhysicsSystem.js";
import { RenderSprites } from "../Render/RenderSprites.js";

export class DeathPiece extends Entity {
    static updateAll(state, dt, spatialFrame = null) {
        if (!state.deathPieces) return;
        for (let i = state.deathPieces.length - 1; i >= 0; i--) {
            const p = state.deathPieces[i];
            p.update(dt, state, spatialFrame);
            if (p.isDead) {
                state.deathPieces.splice(i, 1);
            }
        }
    }

    constructor(x, y, vx, vy, angle, omega, type, color, sizeOrScale, config = {}) {
        super(x, y, angle, false);
        this.vx = vx;
        this.vy = vy;
        this.omega = omega;
        this.type = type; // "body" or "turret"
        this.color = color;
        
        if (this.type === "body") {
            this.radius = sizeOrScale;
            this.pieceIndex = config.pieceIndex ?? 0;
            this.totalPieces = config.totalPieces ?? 4;
            
            // Centroid (center of mass) of the circular sector
            const alpha = Math.PI / this.totalPieces;
            const bisector = (this.pieceIndex / this.totalPieces) * Math.PI * 2 + alpha;
            const d = (2 * this.radius * Math.sin(alpha)) / (3 * alpha);
            this.shiftX = Math.cos(bisector) * d;
            this.shiftY = Math.sin(bisector) * d;
        } else if (this.type === "turret") {
            this.turretScale = sizeOrScale;
            // The turret shape is bounded by a smaller radius for wall collisions
            this.radius = sizeOrScale * 2.5; 
        }

        this.lifetime = config.lifetime ?? (800 + Math.random() * 600); // ms
        this.maxLifetime = this.lifetime;
        this.opacity = 1.0;
        this.drag = config.drag ?? 3.0; // deceleration drag
    }

    update(dt, state, spatialFrame = null) {
        // Move according to velocity
        this.x += this.vx * (dt / 1000);
        this.y += this.vy * (dt / 1000);

        // Spin
        this.angle += this.omega * (dt / 1000);

        // Slow down due to friction/drag
        const dragFactor = Math.exp(-this.drag * (dt / 1000));
        this.vx *= dragFactor;
        this.vy *= dragFactor;

        // Wall collisions
        PhysicsSystem.resolveWallCollisions(this, spatialFrame, state);

        // Fade out
        this.lifetime -= dt;
        this.opacity = Math.max(0, this.lifetime / this.maxLifetime);
        if (this.lifetime <= 0) {
            this.isDead = true;
        }
    }

    render(ctx, renderer) {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);
        ctx.globalAlpha = this.opacity;

        if (this.type === "body") {
            // Draw a wedge/sector representing a shattered portion of the circle
            const startAngle = (this.pieceIndex / this.totalPieces) * Math.PI * 2;
            const endAngle = ((this.pieceIndex + 1) / this.totalPieces) * Math.PI * 2;
            
            ctx.fillStyle = this.color;
            ctx.beginPath();
            // Draw the arc relative to the offset centroid so it spins around the centroid
            ctx.moveTo(-this.shiftX, -this.shiftY);
            ctx.arc(-this.shiftX, -this.shiftY, this.radius, startAngle, endAngle);
            ctx.closePath();
            ctx.fill();
        } else if (this.type === "turret") {
            // Re-use renderer's turret cache to draw a detached spinning turret
            const cacheKey = `${this.turretScale}_${this.color}`;
            const cachedSprite = renderer.turretCache.get(cacheKey, RenderSprites.turret, this.turretScale, this.color);
            ctx.drawImage(cachedSprite.offCanvas, -cachedSprite.cx, -cachedSprite.cy);
        }

        ctx.restore();
    }
}
