import { drawLaserBeam } from "../Render/LaserBeam.js";
export class Laser {
    constructor(x1, y1, x2, y2, color = "#ff0000", isSight = false) {
        this.x1 = x1;
        this.y1 = y1;
        this.x2 = x2;
        this.y2 = y2;
        this.color = color;
        this.isSight = isSight;
    }
    isVisible(viewport) {
        if (!viewport) return true;
        return viewport.intersectsWorldAabb(Math.min(this.x1, this.x2), Math.max(this.x1, this.x2), Math.min(this.y1, this.y2), Math.max(this.y1, this.y2));
    }
    render(ctx) {
        drawLaserBeam(ctx, this.x1, this.y1, this.x2, this.y2, this.color, this.isSight);
    }
}
