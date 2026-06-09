import { PolygonShape } from "../collision/Shapes.js";
/**
 * Static ground sensor — world position + local polygon vertices (facing 0).
 * Duck-types entity pose for {@link SatCollision.checkCollision}.
 *
 * @param {number} x — world center
 * @param {number} y
 * @param {number} halfWidth
 * @param {number} halfHeight
 * @param {{ id?: string }} [options]
 */
export function createRectGroundZone(x, y, halfWidth, halfHeight, { id = "ground-zone" } = {}) {
    const shape = new PolygonShape([
        { x: -halfWidth, y: -halfHeight },
        { x: halfWidth, y: -halfHeight },
        { x: halfWidth, y: halfHeight },
        { x: -halfWidth, y: halfHeight },
    ]);
    return {
        id,
        x,
        y,
        facing: 0,
        shape,
        aabb: { minX: x - halfWidth, minY: y - halfHeight, maxX: x + halfWidth, maxY: y + halfHeight },
        getShape() {
            return this.shape;
        },
        _occupants: new Set(),
        _nextOccupants: new Set(),
    };
}
