import { DestructibleEntity } from "./Entity.js";
import { getWallReach } from "../Spatial/Geometry/WallGeometry.js";

export class Segment extends DestructibleEntity {
    constructor(x, y, angle, size, padding = 10, maxHealth = 30, health = 30, isDead = false) {
        super(x, y, angle, maxHealth, health, isDead);
        this.size = size;
        this.padding = padding;
        this.theme = null;
    }

    getBounds() {
        const reach = getWallReach(this);
        return {
            minX: this.x - reach,
            minY: this.y - reach,
            maxX: this.x + reach,
            maxY: this.y + reach,
        };
    }

    handleHit(damage, ctx) {
        const died = this.takeDamage(damage);
        if (died) {
            const idx = ctx.state.walls.indexOf(this);
            if (idx !== -1) {
                ctx.state.walls.splice(idx, 1);
            }
            if (ctx.state.wallSpatialHash) {
                ctx.state.wallSpatialHash.remove(this);
            }
            const damageBounds = ctx.state.obstacleGrid.patchAfterWallRemoved(this, ctx.state.wallSpatialHash);
            ctx.state.floorTiles.invalidateGridBounds(damageBounds);
            ctx.state.navigation.onObstaclesChanged(
                damageBounds,
                ctx.state.player.x,
                ctx.state.player.y,
                ctx.state.player.isMoving ? ctx.state.player.targetX : null,
                ctx.state.player.isMoving ? ctx.state.player.targetY : null
            );
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