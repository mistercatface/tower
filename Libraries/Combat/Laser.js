import { drawLaserBeam } from "../Render/LaserBeam.js";
import { aabbFromTwoPointsInto, createAabb } from "../Math/Aabb2D.js";
export class Laser {
    constructor(x1, y1, x2, y2, color = "#ff0000", isSight = false) {
        this.x1 = x1;
        this.y1 = y1;
        this.x2 = x2;
        this.y2 = y2;
        this.color = color;
        this.isSight = isSight;
        this._visibilityBounds = createAabb();
    }
    isVisible(viewport) {
        aabbFromTwoPointsInto(this._visibilityBounds, this.x1, this.y1, this.x2, this.y2);
        return viewport.intersectsAabb(this._visibilityBounds);
    }
    render(ctx) {
        drawLaserBeam(ctx, this.x1, this.y1, this.x2, this.y2, this.color, this.isSight);
    }
}
