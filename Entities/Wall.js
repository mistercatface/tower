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
    handleHit(damage, state) {
        const died = this.takeDamage(damage);
        if (died) {
            const idx = state.walls.indexOf(this);
            if (idx !== -1) state.walls.splice(idx, 1);
            if (state.wallSpatialIndex) state.wallSpatialIndex.remove(this);
            const damageBounds = state.obstacleGrid.patchAfterWallRemoved(this, state.wallSpatialIndex);
            state.worldSurfaces.invalidateGridBounds(damageBounds, state);
            state.worldSurfaces.invalidateRoofs();
            if (state.worldSurfaces.renderScene) state.worldSurfaces.renderScene.removeBySourceId(this.id ?? this);
            state.navigation.onObstaclesChanged(damageBounds);
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
