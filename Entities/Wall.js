import { DestructibleEntity } from "./Entity.js";

export class Segment extends DestructibleEntity {
    constructor(x, y, angle, size, padding = 10, maxHealth = 30, health = 30, isDead = false) {
        super(x, y, angle, maxHealth, health, isDead);
        this.size = size;
        this.padding = padding;
        this.theme = null;
    }

    getBounds() {
        const boundingRadius = (this.size / 2) * Math.SQRT2 + this.padding;
        return {
            minX: this.x - boundingRadius,
            minY: this.y - boundingRadius,
            maxX: this.x + boundingRadius,
            maxY: this.y + boundingRadius
        };
    }

    handleHit(damage, ctx) {
        const died = this.takeDamage(damage);
        if (died) {
            const idx = ctx.state.walls.indexOf(this);
            if (idx !== -1) {
                ctx.state.walls.splice(idx, 1);
            }
            ctx.state.gridSystem.rebuild(ctx.state.walls, ctx.state.player.x, ctx.state.player.y);
            if (ctx.state.player.isMoving && ctx.state.player.targetX !== null && ctx.state.player.targetY !== null) {
                ctx.state.gridSystem.buildPlayerFlowField(ctx.state.player.targetX, ctx.state.player.targetY);
            }
        }
    }
}

export function buildArcWall(segmentsArray, x, y, radius, startAngle, endAngle, size) {
    if (radius === 0 && startAngle === 0 && endAngle === 0) return;
    const arcLength = radius * Math.abs(endAngle - startAngle);
    const numSegments = Math.max(1, Math.ceil(arcLength / (size * 1.1)));
    const angleStep = (endAngle - startAngle) / numSegments;
    for (let i = 0; i < numSegments; i++) {
        const angle = startAngle + i * angleStep + angleStep / 2;
        segmentsArray.push(new Segment(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius, angle, size));
    }
}