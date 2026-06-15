import { Entity } from "./Entity.js";
import { centerReachAabbInto, createAabb } from "../Libraries/Math/Aabb2D.js";
import { getWallReach } from "../Libraries/Spatial/geometry/WallGeometry.js";
export class Segment extends Entity {
    constructor(x, y, angle, size, padding = 10, isDead = false, wallHeight = null) {
        super(x, y, angle, isDead);
        this.size = size;
        this.padding = padding;
        this.wallHeight = wallHeight;
        this.bounds = createAabb();
    }
    getBounds() {
        return centerReachAabbInto(this.bounds, this.x, this.y, getWallReach(this));
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
