import { DestructibleEntity } from "./Entity.js";
import { getWallReach } from "../Libraries/Spatial/geometry/WallGeometry.js";
export class Segment extends DestructibleEntity {
    constructor(x, y, angle, size, padding = 10, maxHealth = 30, health = 30, isDead = false, wallHeight = null) {
        super(x, y, angle, maxHealth, health, isDead);
        this.size = size;
        this.padding = padding;
        this.wallHeight = wallHeight;
    }
    getBounds() {
        const reach = getWallReach(this);
        return { minX: this.x - reach, minY: this.y - reach, maxX: this.x + reach, maxY: this.y + reach };
    }
    handleHit(damage, ctx) {
        const died = this.takeDamage(damage);
        if (died) {
            const idx = ctx.state.walls.indexOf(this);
            if (idx !== -1) ctx.state.walls.splice(idx, 1);
            if (ctx.state.wallSpatialIndex) ctx.state.wallSpatialIndex.remove(this);
            if (ctx.state.roofSpatialIndices && this.wallHeight != null) {
                const roofIndex = ctx.state.roofSpatialIndices.get(this.wallHeight);
                if (roofIndex) roofIndex.remove(this);
            }
            const damageBounds = ctx.state.obstacleGrid.patchAfterWallRemoved(this, ctx.state.wallSpatialIndex);
            ctx.state.worldSurfaces.invalidateGridBounds(damageBounds, ctx.state);
            ctx.state.navigation.onObstaclesChanged(damageBounds);
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
